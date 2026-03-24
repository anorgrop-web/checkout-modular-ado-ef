/**
 * Catálogo de produtos por rota/página de checkout.
 * Produtos Firmage Dermalux.
 */

export interface ProductItem {
  descricao: string
  base_value: number
  valor: number
  originalPrice: number
  quantidade: number
  ref: string
  marca: string
  sku: string
  categoria: string
}

export interface ProductCatalogEntry {
  product: ProductItem
}

// Mapeamento de rota → produto
const catalog: Record<string, ProductCatalogEntry> = {
  "/kit1": {
    product: {
      descricao: "Kit 1 Firmage - Dermalux",
      base_value: 167.0,
      valor: 167.0,
      originalPrice: 297.0,
      quantidade: 1,
      ref: "FMG-KIT1",
      marca: "Firmage",
      sku: "FMG-KIT1-DLX",
      categoria: "Dermocosmético",
    },
  },
  "/kit3": {
    product: {
      descricao: "Kit 3 Firmage - Dermalux",
      base_value: 397.0,
      valor: 397.0,
      originalPrice: 891.0,
      quantidade: 1,
      ref: "FMG-KIT3",
      marca: "Firmage",
      sku: "FMG-KIT3-DLX",
      categoria: "Dermocosmético",
    },
  },
  "/completo": {
    product: {
      descricao: "Kit Dermalux Completo",
      base_value: 497.0,
      valor: 497.0,
      originalPrice: 1194.0,
      quantidade: 1,
      ref: "FMG-COMP",
      marca: "Firmage",
      sku: "FMG-COMP-DLX",
      categoria: "Dermocosmético",
    },
  },
}

/**
 * Retorna o produto correspondente à rota do checkout.
 * Fallback para /kit1 se rota não encontrada.
 */
export function getProductForRoute(route: string): ProductCatalogEntry {
  return catalog[route] || catalog["/kit1"]
}

/**
 * Cria um item de frete para o array de products.
 */
export function createShippingProduct(shippingCost: number, shippingMethod: string): ProductItem {
  const shippingRefs: Record<string, string> = {
    pac: "FRETE-PAC",
    jadlog: "FRETE-JADLOG",
    sedex: "FRETE-SEDEX",
  }

  return {
    descricao: "Frete",
    base_value: shippingCost,
    valor: shippingCost,
    originalPrice: shippingCost,
    quantidade: 1,
    ref: shippingRefs[shippingMethod] || "FRETE",
    marca: "",
    sku: "",
    categoria: "Frete",
  }
}
