#!/usr/bin/env python3
"""tools/make_icons.py

Gera os ícones PNG do Tabuada Turbo usando SOMENTE a stdlib do Python
(struct + zlib) — sem Pillow, sem nenhuma dependência externa. Escreve os
bytes crus do formato PNG (assinatura + chunks IHDR/IDAT/IEND).

Desenha um fundo roxo #7c3aed sólido com um "×" claro (#fef9ff) no centro.

Rode uma vez a partir de qualquer diretório:
    python3 tools/make_icons.py
e commite os PNGs gerados em icons/.
"""
import os
import struct
import zlib

ROXO = (0x7C, 0x3A, 0xED, 0xFF)
CLARO = (0xFE, 0xF9, 0xFF, 0xFF)

SAIDA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")


def criar_png(largura, altura, pixels_rgba):
    """Monta um PNG cru a partir de uma lista linear de pixels RGBA."""

    def chunk(tipo, dados):
        corpo = tipo + dados
        crc = zlib.crc32(corpo) & 0xFFFFFFFF
        return struct.pack(">I", len(dados)) + corpo + struct.pack(">I", crc)

    assinatura = b"\x89PNG\r\n\x1a\n"

    ihdr = struct.pack(">IIBBBBB", largura, altura, 8, 6, 0, 0, 0)  # 8bpp, RGBA

    linhas = bytearray()
    for y in range(altura):
        linhas.append(0)  # filtro "none" no início de cada scanline
        for x in range(largura):
            r, g, b, a = pixels_rgba[y * largura + x]
            linhas.extend((r, g, b, a))
    idat = zlib.compress(bytes(linhas), 9)

    png = assinatura
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", idat)
    png += chunk(b"IEND", b"")
    return png


def desenhar_icone(tamanho, maskable=False):
    """Fundo roxo sólido + um '×' claro desenhado por distância às diagonais.

    Se `maskable=True`, deixa uma margem de segurança maior (a área central
    ~80% é a "safe zone" garantida em ícones maskable de PWA).
    """
    pixels = [ROXO] * (tamanho * tamanho)

    margem = 0.30 if maskable else 0.18
    espessura = tamanho * 0.085
    inicio = tamanho * margem
    fim = tamanho * (1 - margem)

    for y in range(tamanho):
        for x in range(tamanho):
            if x < inicio or x > fim or y < inicio or y > fim:
                continue
            # distância do ponto (x,y) às duas diagonais do quadrado [inicio,fim]
            d1 = abs((x - inicio) - (y - inicio)) / 1.4142135623730951
            d2 = abs((x - inicio) - (fim - y)) / 1.4142135623730951
            if d1 <= espessura / 2 or d2 <= espessura / 2:
                pixels[y * tamanho + x] = CLARO

    return criar_png(tamanho, tamanho, pixels)


def main():
    os.makedirs(SAIDA_DIR, exist_ok=True)

    especificacoes = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]

    for nome_arquivo, tamanho, maskable in especificacoes:
        dados_png = desenhar_icone(tamanho, maskable=maskable)
        caminho = os.path.join(SAIDA_DIR, nome_arquivo)
        with open(caminho, "wb") as f:
            f.write(dados_png)
        print(f"gerado: {caminho} ({len(dados_png)} bytes)")


if __name__ == "__main__":
    main()
