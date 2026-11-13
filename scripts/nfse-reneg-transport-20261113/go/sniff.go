package main

// helloSniffer lê, em texto claro, o primeiro ServerHello do handshake inicial e registra se o
// servidor ecoou renegotiation_info (RFC 5746, ext 0xff01 com renegotiated_connection vazio).
// Go aceitaria renegociar mesmo sem a extensão; aqui isso é recusado antes de enviar a requisição.
type helloSniffer struct {
	buf  []byte // payloads de registros handshake (tipo 22)
	rec  []byte // bytes brutos pendentes de registro
	done bool
	ok   bool
}

func (s *helloSniffer) feed(b []byte) {
	if s.done {
		return
	}
	s.rec = append(s.rec, b...)
	for len(s.rec) >= 5 {
		n := int(s.rec[3])<<8 | int(s.rec[4])
		if len(s.rec) < 5+n {
			break
		}
		if s.rec[0] == 22 {
			s.buf = append(s.buf, s.rec[5:5+n]...)
		}
		s.rec = s.rec[5+n:]
		if s.try() || len(s.buf) > 1<<16 {
			s.done = true
			return
		}
	}
}

func (s *helloSniffer) try() bool {
	b := s.buf
	if len(b) < 4 {
		return false
	}
	if b[0] != 2 {
		return true // primeiro handshake não é ServerHello: ok=false
	}
	n := int(b[1])<<16 | int(b[2])<<8 | int(b[3])
	if len(b) < 4+n {
		return false
	}
	s.ok = hasSecureReneg(b[4 : 4+n])
	return true
}

func hasSecureReneg(h []byte) bool {
	p := 2 + 32
	if len(h) < p+1 {
		return false
	}
	p += 1 + int(h[p])
	p += 2 + 1
	if len(h) < p+2 {
		return false
	}
	end := p + 2 + (int(h[p])<<8 | int(h[p+1]))
	p += 2
	if end > len(h) {
		return false
	}
	for p+4 <= end {
		t := int(h[p])<<8 | int(h[p+1])
		l := int(h[p+2])<<8 | int(h[p+3])
		p += 4
		if p+l > end {
			return false
		}
		if t == 0xff01 {
			return l == 1 && h[p] == 0
		}
		p += l
	}
	return false
}
