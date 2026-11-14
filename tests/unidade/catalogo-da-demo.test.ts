// O catálogo da demo (seed/produtos.csv) acha os itens do dia a dia (TU47): o que o cliente manda
// por texto ou por foto à Capi tem produto em 3 lojas ou mais, para a comparação de preço aparecer.
// A busca é a do servidor (functions/_lib/catalogo.ts): cada termo precisa aparecer no nome, na
// descrição, na categoria, no nome da loja ou nos atributos, onde fica a lista "busca" de sinônimos.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ehCategoria } from '../../functions/_lib/regras/categorias'
import { normalizar, termosDaBusca, textosDoJson } from '../../functions/_lib/texto'

const raiz = new URL('../../', import.meta.url)
const FIM_DE_LINHA = new Set(['\n', '\r'])

/** CSV com aspas, como o do seed (scripts/gerar-seed.mjs › lerCsv). */
function lerCsv(caminho: string): Record<string, string>[] {
  const bruto = readFileSync(new URL(caminho, raiz), 'utf8')
  const texto = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  const fecharCampo = () => {
    linha.push(campo)
    campo = ''
  }
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ',') fecharCampo()
    else if (FIM_DE_LINHA.has(c)) {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fecharCampo()
      linhas.push(linha)
      linha = []
    } else campo += c
  }
  if (campo || linha.length) {
    fecharCampo()
    linhas.push(linha)
  }
  const [cabecalho, ...dados] = linhas
  return dados.filter((v) => v.some((x) => x.trim())).map((v) => Object.fromEntries(cabecalho.map((c, j) => [c, v[j] ?? ''])))
}

const lojas = new Map(lerCsv('seed/lojas.csv').map((l) => [l.loja, l.nome_da_marca]))
const produtos = lerCsv('seed/produtos.csv')

/** Os produtos que a busca por texto acha, como buscarNoCatalogo: todos os termos têm que aparecer. */
function buscar(texto: string) {
  const termos = termosDaBusca(texto)
  return produtos.filter((p) => {
    const tudo = normalizar(
      [p.nome, p.descricao, p.categoria, lojas.get(p.loja) ?? '', ...textosDoJson(JSON.parse(p.atributos || '{}'))].join(' '),
    )
    return termos.every((t) => tudo.includes(t))
  })
}

const lojasDe = (lista: Record<string, string>[]) => new Set(lista.map((p) => lojas.get(p.loja)))

describe('TU47: o catálogo da demo acha os itens do dia a dia', () => {
  it.each([
    'óculos de sol',
    'bolsa',
    'carteira',
    'copo stanley',
    'garrafa térmica',
    'garrafa de água',
    'pulseira',
    'colar',
    'relógio',
    'celular',
    'fone de ouvido',
    'carregador',
    'calça jeans',
    'camiseta',
    'moletom',
    'boné',
    'mochila',
    'perfume',
    'maquiagem',
  ])('"%s" tem produto em 3 lojas ou mais', (texto) => {
    expect(lojasDe(buscar(texto)).size).toBeGreaterThanOrEqual(3)
  })

  it('o copo e a garrafa térmica estão em casa e em esportes: a foto acha pela categoria que a Capi escolher', () => {
    const termicos = buscar('térmica')
    expect(lojasDe(termicos.filter((p) => p.categoria === 'casa')).size).toBeGreaterThanOrEqual(3)
    expect(lojasDe(termicos.filter((p) => p.categoria === 'esportes')).size).toBeGreaterThanOrEqual(3)
  })

  it('os óculos de sol estão em 3 lojas da ótica e também em acessórios', () => {
    const oculos = buscar('óculos de sol')
    expect(lojasDe(oculos.filter((p) => p.categoria === 'otica')).size).toBeGreaterThanOrEqual(3)
    expect(lojasDe(oculos.filter((p) => p.categoria === 'acessorios')).size).toBeGreaterThanOrEqual(2)
  })

  it('cada produto tem loja da planta, categoria do shopping, foto que existe (ou a espiral) e atributos em JSON', () => {
    for (const p of produtos) {
      expect(lojas.has(p.loja), `${p.nome}: loja ${p.loja}`).toBe(true)
      expect(ehCategoria(p.categoria), `${p.nome}: categoria ${p.categoria}`).toBe(true)
      if (p.fotos) expect(existsSync(new URL(`public${p.fotos}`, raiz)), `${p.nome}: ${p.fotos}`).toBe(true)
      expect(() => JSON.parse(p.atributos || '{}'), p.nome).not.toThrow()
    }
  })

  it('os produtos dos tipos do dia a dia têm a lista "busca" de sinônimos nos atributos', () => {
    const tipos =
      /^(óculos de sol|bolsa|carteira|pulseira|colar|relógio|copo térmico|garrafa térmica|celular|carregador|fone|calça jeans|camiseta|moletom|boné|mochila|perfume|batom|paleta|base líquida)/i
    const doDia = produtos.filter((p) => tipos.test(p.nome))
    expect(doDia.length).toBeGreaterThan(50)
    for (const p of doDia) {
      const busca = JSON.parse(p.atributos).busca
      expect(Array.isArray(busca) && busca.length > 0, p.nome).toBe(true)
    }
  })
})
