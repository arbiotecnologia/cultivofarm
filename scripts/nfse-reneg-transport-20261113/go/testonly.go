//go:build js && wasm && nfsetest

package main

import (
	"crypto/tls"
	"crypto/x509"
	"syscall/js"
)

const host = "sefin.producaorestrita.nfse.gov.br"

// Somente build de teste local: acrescenta CA sintética às raízes.
var testOverride = func(c *tls.Config, o js.Value) bool {
	ca := o.Get("testCaPem")
	if ca.Type() != js.TypeString { return true }
	p := x509.NewCertPool()
	if !p.AppendCertsFromPEM([]byte(ca.String())) { return false }
	c.RootCAs = p
	return true
}
