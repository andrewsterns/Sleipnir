import { describe, it, expect } from 'vitest'
import { renderTemplate } from './index'
import { featureLabel } from '../scaffoldPlan'
import { scaffoldFileName } from '../naming'
import type { LanguageId, NodeRole } from '../architectures'
import { LANGUAGES } from '../architectures'

const ROLES: NodeRole[] = ['node', 'view', 'view-model', 'interface', 'controller', 'presenter']

// Every brace, bracket and paren closes — the cheapest "is this source-shaped" check.
const balanced = (text: string) => {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const stack: string[] = []
  for (const ch of text) {
    if ('([{'.includes(ch)) stack.push(ch)
    else if (ch in pairs && stack.pop() !== pairs[ch]) return false
  }
  return stack.length === 0
}

describe('file names follow each language', () => {
  it('uses the language table naming convention', () => {
    expect(scaffoldFileName('react', 'view-model', 'shopping cart')).toBe('shoppingCartViewModel.tsx')
    expect(scaffoldFileName('rust', 'view-model', 'shopping cart')).toBe('shopping_cart_view_model.rs')
    expect(scaffoldFileName('python', 'view', 'cart')).toBe('cart_view.py')
    expect(scaffoldFileName('c', 'view', 'cart')).toBe('cart_view.c')
    expect(scaffoldFileName('c', 'view', 'cart', { header: true })).toBe('cart_view.h')
    expect(scaffoldFileName('cpp', 'presenter', 'cart', { header: true })).toBe('cart_presenter.hpp')
    // Java requires the file to be named after its public class.
    expect(scaffoldFileName('java', 'view-model', 'cart')).toBe('CartViewModel.java')
    expect(scaffoldFileName('kotlin', 'view', 'cart')).toBe('CartView.kt')
    expect(scaffoldFileName('csharp', 'interface', 'cart')).toBe('CartInterface.cs')
  })

  it('reads the feature name back out of any convention', () => {
    expect(featureLabel('src/cart/cartViewModel.tsx', 'view-model')).toBe('cart')
    expect(featureLabel('src/cart/cart_view_model.c', 'view-model')).toBe('cart')
    expect(featureLabel('src/main/java/shop/CartViewModel.java', 'view-model')).toBe('Cart')
    expect(featureLabel('src/cart/cart_view.rs', 'view')).toBe('cart')
  })
})

describe('every language scaffolds every role', () => {
  for (const { id } of LANGUAGES.filter((l) => l.architectural)) {
    it(`${id}: balanced declarations named after the role`, () => {
      for (const role of ROLES) {
        const file = renderTemplate(id as LanguageId, role, 'cart')
        expect(balanced(file.content), `${id} ${role}`).toBe(true)
        expect(file.content, `${id} ${role}`).toMatch(role === 'node' ? /Cart/ : /Cart(View|ViewModel|Interface|Controller|Presenter)/)
      }
    })
  }
})

describe('C and C++: a header and a source per role', () => {
  it('pairs a C source with its guarded header, which the source includes', () => {
    const file = renderTemplate('c', 'view-model', 'cart')
    expect(file.fileName).toBe('cart_view_model.c')
    expect(file.content).toContain('#include "cart_view_model.h"')
    expect(file.content).toContain('void cart_view_model_init(CartViewModel *self)')
    expect(file.companion?.fileName).toBe('cart_view_model.h')
    expect(file.companion?.content).toMatch(/#ifndef CART_VIEW_MODEL_H\n#define CART_VIEW_MODEL_H[\s\S]*#endif/)
    expect(file.companion?.content).toContain('void cart_view_model_init(CartViewModel *self);')
  })

  it('makes an interface a header alone', () => {
    const c = renderTemplate('c', 'interface', 'cart')
    expect(c.fileName).toBe('cart_interface.h')
    expect(c.companion).toBeUndefined()
    expect(c.content).toContain('void (*update)(void *self);')
    const cpp = renderTemplate('cpp', 'interface', 'cart')
    expect(cpp.content).toContain('virtual ~CartInterface() = default;')
  })

  it('renders a planned header as a header', () => {
    expect(renderTemplate('cpp', 'view', 'engine', { header: true }).content).toMatch(/^#pragma once/)
  })
})

describe('packages and namespaces from the folder', () => {
  it('derives a Java or Kotlin package under a source root, and a C# namespace', () => {
    expect(renderTemplate('java', 'view', 'cart', { folder: 'src/main/java/com/shop/cart' }).content).toMatch(/^package com\.shop\.cart;\n\npublic class CartView/)
    expect(renderTemplate('kotlin', 'interface', 'cart', { folder: 'src/main/kotlin/shop' }).content).toBe('package shop\n\ninterface CartInterface\n')
    expect(renderTemplate('java', 'view', 'cart', { folder: 'lib' }).content).toBe('public class CartView {\n}\n')
    expect(renderTemplate('csharp', 'view', 'cart', { folder: 'Shop/cart' }).content).toMatch(/^namespace Cart;/)
  })
})
