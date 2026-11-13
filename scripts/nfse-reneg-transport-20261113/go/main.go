//go:build js && wasm

// Transporte TLS 1.2 com renegociação segura (RFC 5746) para o GET de reconciliação
// NFS-e em homologação. O socket TCP é do host (Deno.connect); este módulo só faz TLS.
// Host fixo, raízes Mozilla (fallback), validação de cadeia+hostname, GET apenas.
// Nunca registra material; erros saem só como enums allowlisted.
package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net"
	"regexp"
	"strings"
	"syscall/js"
	"time"

	_ "golang.org/x/crypto/x509roots/fallback"
)

const maxResponse = 7 * 1024 * 1024

var pathRe = regexp.MustCompile(`^/(API/)?SefinNacional/(dps/DPS[0-9]{42}|nfse/[0-9]{50}|docs/index)$`)

type jsConn struct {
	io    js.Value
	rbuf  []byte
	eof   bool
	sniff helloSniffer
}

func await(p js.Value) (js.Value, error) {
	type res struct {
		v   js.Value
		err error
	}
	ch := make(chan res, 1)
	ok := js.FuncOf(func(_ js.Value, a []js.Value) any { var v js.Value; if len(a) > 0 { v = a[0] }; ch <- res{v: v}; return nil })
	ko := js.FuncOf(func(_ js.Value, a []js.Value) any { ch <- res{err: errors.New("io")}; return nil })
	p.Call("then", ok, ko)
	r := <-ch
	ok.Release()
	ko.Release()
	return r.v, r.err
}

func (c *jsConn) Read(b []byte) (int, error) {
	if len(c.rbuf) == 0 {
		if c.eof {
			return 0, io.EOF
		}
		v, err := await(c.io.Call("read"))
		if err != nil {
			return 0, errTransportRead
		}
		if v.IsNull() || v.IsUndefined() {
			c.eof = true
			return 0, io.EOF
		}
		buf := make([]byte, v.Get("length").Int())
		js.CopyBytesToGo(buf, v)
		c.sniff.feed(buf)
		c.rbuf = buf
	}
	n := copy(b, c.rbuf)
	c.rbuf = c.rbuf[n:]
	return n, nil
}
func (c *jsConn) Write(b []byte) (int, error) {
	u := js.Global().Get("Uint8Array").New(len(b))
	js.CopyBytesToJS(u, b)
	if _, err := await(c.io.Call("write", u)); err != nil {
		return 0, errTransportWrite
	}
	return len(b), nil
}
func (c *jsConn) Close() error                     { c.io.Call("close"); return nil }
func (c *jsConn) LocalAddr() net.Addr              { return &net.TCPAddr{} }
func (c *jsConn) RemoteAddr() net.Addr             { return &net.TCPAddr{} }
func (c *jsConn) SetDeadline(time.Time) error      { return nil }
func (c *jsConn) SetReadDeadline(time.Time) error  { return nil }
func (c *jsConn) SetWriteDeadline(time.Time) error { return nil }

var errTransportRead = errors.New("transport_read")
var errTransportWrite = errors.New("transport_write")

func classify(err error) string {
	var ua x509.UnknownAuthorityError
	var he x509.HostnameError
	var ci x509.CertificateInvalidError
	var ae tls.AlertError
	var re tls.RecordHeaderError
	switch {
	case errors.Is(err, errTransportRead):
		return "tcp_read_failed"
	case errors.Is(err, errTransportWrite):
		return "tcp_write_failed"
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		return "tls_unexpected_eof"
	case errors.As(err, &ua):
		return "tls_unknown_issuer"
	case errors.As(err, &he):
		return "tls_hostname_mismatch"
	case errors.As(err, &ci):
		if ci.Reason == x509.Expired {
			return "tls_cert_expired"
		}
		return "tls_cert_invalid"
	case errors.As(err, &ae):
		switch uint8(ae) {
		case 40:
			return "tls_alert_handshake_failure"
		case 42, 116:
			return "tls_alert_certificate_required"
		case 48:
			return "tls_alert_unknown_ca"
		case 100:
			return "tls_alert_no_renegotiation"
		case 70:
			return "tls_alert_protocol_version"
		}
		return "tls_alert_other"
	case errors.As(err, &re):
		return "tls_record_invalid"
	}
	m := err.Error()
	switch {
	case strings.Contains(m, "secure renegotiation"), strings.Contains(m, "renegotiation_info"), strings.Contains(m, "renegotiation extension"):
		return "tls_insecure_renegotiation_refused"
	case strings.Contains(m, "renegotiation"):
		return "tls_renegotiation_refused"
	case strings.Contains(m, "no cipher suite"), strings.Contains(m, "cipher"):
		return "tls_cipher_mismatch"
	case strings.Contains(m, "protocol version"):
		return "tls_protocol_version"
	case strings.Contains(m, "certificate"):
		return "tls_cert_invalid"
	}
	return "tls_error_other"
}

var versions = map[uint16]string{tls.VersionTLS12: "TLS1.2", tls.VersionTLS13: "TLS1.3"}

// request(io, {path, certPem, keyPem}) → Promise<{ok, code?, raw?, tls}>
func request(cfgOverride func(*tls.Config, js.Value) bool) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) any {
		jsio, opts := args[0], args[1]
		executor := js.FuncOf(func(_ js.Value, pr []js.Value) any {
			resolve := pr[0]
			go func() {
				out := map[string]any{"ok": false}
				info := map[string]any{"certRequested": false, "clientCertSent": false, "renegotiated": false, "secureRenegotiation": false}
				defer func() { out["tls"] = info; resolve.Invoke(js.ValueOf(out)) }()
				path := opts.Get("path").String()
				if !pathRe.MatchString(path) {
					out["code"] = "path_blocked"
					return
				}
				var certs []tls.Certificate
				if cp := opts.Get("certPem"); cp.Type() == js.TypeString {
					c, err := tls.X509KeyPair([]byte(cp.String()), []byte(opts.Get("keyPem").String()))
					if err != nil {
						out["code"] = "client_cert_invalid"
						return
					}
					certs = []tls.Certificate{c}
				}
				initialDone := false
				cfg := &tls.Config{
					ServerName:    host,
					MinVersion:    tls.VersionTLS12,
					MaxVersion:    tls.VersionTLS12, // renegociação só existe em TLS 1.2
					Renegotiation: tls.RenegotiateOnceAsClient,
					NextProtos:    []string{"http/1.1"},
					GetClientCertificate: func(*tls.CertificateRequestInfo) (*tls.Certificate, error) {
						info["certRequested"] = true
						if initialDone {
							info["renegotiated"] = true
						}
						if len(certs) == 0 {
							return &tls.Certificate{}, nil
						}
						info["clientCertSent"] = true
						return &certs[0], nil
					},
				}
				if cfgOverride != nil && !cfgOverride(cfg, opts) {
					out["code"] = "config_blocked"
					return
				}
				raw := &jsConn{io: jsio}
				conn := tls.Client(raw, cfg)
				defer conn.Close()
				if err := conn.Handshake(); err != nil {
					out["code"] = classify(err)
					out["stage"] = "handshake"
					return
				}
				initialDone = true
				if !raw.sniff.done || !raw.sniff.ok {
					out["code"] = "tls_insecure_renegotiation_refused"
					out["stage"] = "handshake"
					return
				}
				info["secureRenegotiation"] = true
				st := conn.ConnectionState()
				info["version"] = versions[st.Version]
				info["cipher"] = tls.CipherSuiteName(st.CipherSuite)
				info["alpn"] = st.NegotiatedProtocol
				info["chainVerified"] = len(st.VerifiedChains) > 0
				req := "GET " + path + " HTTP/1.1\r\nHost: " + host + "\r\nAccept: application/json\r\nUser-Agent: CultivoFarm-NFSe-Reconcile/1\r\nConnection: close\r\n\r\n"
				if _, err := conn.Write([]byte(req)); err != nil {
					out["code"] = classify(err)
					out["stage"] = "request"
					return
				}
				var buf bytes.Buffer
				_, err := io.Copy(&buf, io.LimitReader(conn, maxResponse+1))
				if buf.Len() > maxResponse {
					out["code"] = "response_too_large"
					return
				}
				// close_notify ausente após corpo completo é comum em IIS; o TS valida o tamanho/chunks.
				if err != nil && buf.Len() == 0 {
					out["code"] = classify(err)
					out["stage"] = "response"
					return
				}
				out["truncatedEof"] = err != nil
				u := js.Global().Get("Uint8Array").New(buf.Len())
				js.CopyBytesToJS(u, buf.Bytes())
				out["raw"] = u
				out["ok"] = true
			}()
			return nil
		})
		return js.Global().Get("Promise").New(executor)
	})
}

func main() {
	js.Global().Set("__nfseRenegTls", request(testOverride))
	select {}
}
