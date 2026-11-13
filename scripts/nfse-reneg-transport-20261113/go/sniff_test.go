package main

import "testing"

func hello(exts []byte) []byte {
	body := []byte{3, 3}
	body = append(body, make([]byte, 32)...)
	body = append(body, 0, 0xc0, 0x30, 0)
	body = append(body, byte(len(exts)>>8), byte(len(exts)))
	body = append(body, exts...)
	hs := append([]byte{2, 0, byte(len(body) >> 8), byte(len(body))}, body...)
	return append([]byte{22, 3, 3, byte(len(hs) >> 8), byte(len(hs))}, hs...)
}

func run(rec []byte, split int) bool {
	s := &helloSniffer{}
	s.feed(rec[:split])
	s.feed(rec[split:])
	return s.done && s.ok
}

func TestSecureRenegPresent(t *testing.T) {
	r := hello([]byte{0x00, 0x17, 0, 0, 0xff, 0x01, 0, 1, 0})
	for _, sp := range []int{1, 5, 20, len(r)} {
		if !run(r, sp) {
			t.Fatalf("esperado RFC5746 presente (split %d)", sp)
		}
	}
}
func TestSecureRenegAbsent(t *testing.T) {
	if run(hello([]byte{0x00, 0x17, 0, 0}), 7) {
		t.Fatal("sem 0xff01 deve recusar")
	}
}
func TestSecureRenegNonEmptyInitial(t *testing.T) {
	if run(hello([]byte{0xff, 0x01, 0, 2, 1, 9}), 7) {
		t.Fatal("renegotiated_connection não vazio no inicial deve recusar")
	}
}
func TestNotServerHello(t *testing.T) {
	if run([]byte{22, 3, 3, 0, 4, 11, 0, 0, 0}, 3) {
		t.Fatal("deve recusar")
	}
}
