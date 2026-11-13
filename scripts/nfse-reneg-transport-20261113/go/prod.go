//go:build js && wasm && !nfsetest

package main

import (
	"crypto/tls"
	"syscall/js"
)

const host = "sefin.producaorestrita.nfse.gov.br"

// Produção do módulo: sem nenhuma sobreposição de host/raízes.
var testOverride func(*tls.Config, js.Value) bool = nil
