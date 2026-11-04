import { describe, it, expect } from 'vitest'
import { cAdapter, headerFor } from './cAdapter'
import { javaAdapter, kotlinAdapter } from './jvmAdapter'
import { adapterForPath, languageForPath } from './index'

describe('C and C++ includes', () => {
  const pool = ['include/sensor.h', 'include/filter.h', 'src/sensor.c', 'src/util/math.h', 'lib/vendor/sensor.h']

  it('finds quoted and angle includes, not system headers', () => {
    const src = '#include <stdio.h>\n#include "sensor.h"\n  # include <util/math.h>\n'
    expect(cAdapter.detectImports(src).map((s) => s.raw)).toEqual(['stdio.h', 'sensor.h', 'util/math.h'])
    expect(cAdapter.resolveSpecifier('src/main.c', 'stdio.h', pool)).toBeNull()
  })

  it('looks beside the file first, then include/ and src/, then the shortest path', () => {
    expect(cAdapter.resolveSpecifier('include/filter.h', 'sensor.h', pool)).toBe('include/sensor.h')
    expect(cAdapter.resolveSpecifier('src/main.c', 'sensor.h', pool)).toBe('include/sensor.h')
    expect(cAdapter.resolveSpecifier('src/main.c', 'util/math.h', pool)).toBe('src/util/math.h')
    expect(cAdapter.resolveSpecifier('src/a/b.c', '../sensor.c', pool)).toBe('src/sensor.c')
  })

  it('links to a source through its header, after the existing includes', () => {
    expect(headerFor('src/cart/cart_view_model.c')).toBe('src/cart/cart_view_model.h')
    expect(headerFor('src/engine.cpp')).toBe('src/engine.hpp')
    const view = '#include "cart_view.h"\n\nvoid cart_view_init(void) {}\n'
    const linked = cAdapter.insertImport(view, 'src/cart/cart_view.c', 'src/cart/cart_view_model.c', 'cart', 'view-model')
    expect(linked).toBe('#include "cart_view.h"\n#include "cart_view_model.h"\n\nvoid cart_view_init(void) {}\n')
    expect(cAdapter.insertImport(linked, 'src/cart/cart_view.c', 'src/cart/cart_view_model.c', 'cart')).toBe(linked)
    expect(cAdapter.insertImport('', 'src/app/main.c', 'src/cart/cart.h', 'cart')).toBe('#include "../cart/cart.h"\n')
    expect(cAdapter.removeImport(linked, 'src/cart/cart_view.c', 'src/cart/cart_view_model.c')).toBe(view)
  })

  it('places an include inside a header guard', () => {
    const header = '#ifndef CART_VIEW_H\n#define CART_VIEW_H\n\n#endif\n'
    expect(cAdapter.insertImport(header, 'src/cart_view.h', 'src/cart_view_model.h', 'cart')).toBe('#ifndef CART_VIEW_H\n#define CART_VIEW_H\n\n#include "cart_view_model.h"\n\n#endif\n')
  })
})

describe('Java and Kotlin imports', () => {
  const pool = [
    'src/main/java/com/shop/orders/Order.java',
    'src/main/java/com/shop/util/Money.java',
    'src/main/kotlin/com/shop/cart/Cart.kt',
  ]

  it('resolves classes by package, drops static members, skips wildcards', () => {
    const src = 'package com.shop;\n\nimport com.shop.orders.Order;\nimport static com.shop.util.Money.of;\nimport java.util.*;\nimport com.shop.cart.Cart\n'
    const raws = javaAdapter.detectImports(src).map((s) => s.raw)
    expect(raws).toEqual(['com.shop.orders.Order', 'com.shop.util.Money.of', 'com.shop.cart.Cart'])
    expect(raws.map((r) => javaAdapter.resolveSpecifier('src/main/java/com/shop/App.java', r, pool))).toEqual([
      'src/main/java/com/shop/orders/Order.java',
      'src/main/java/com/shop/util/Money.java',
      'src/main/kotlin/com/shop/cart/Cart.kt',
    ])
  })

  it('writes an import across packages and nothing within one', () => {
    const order = 'package com.shop.orders;\n\npublic class Order {\n}\n'
    expect(javaAdapter.insertImport(order, 'src/main/java/com/shop/orders/Order.java', 'src/main/java/com/shop/util/Money.java', 'money')).toBe(
      'package com.shop.orders;\n\nimport com.shop.util.Money;\n\npublic class Order {\n}\n',
    )
    expect(javaAdapter.insertImport(order, 'src/main/java/com/shop/orders/Order.java', 'src/main/java/com/shop/orders/Line.java', 'line')).toBe(order)
    expect(kotlinAdapter.insertImport('package shop\n\nclass A\n', 'src/main/kotlin/shop/A.kt', 'src/main/kotlin/util/Money.kt', 'money')).toBe(
      'package shop\n\nimport util.Money\n\nclass A\n',
    )
    expect(javaAdapter.importedIdentifier('a', 'src/main/java/com/shop/util/Money.java', 'money')).toBe('Money')
  })
})

describe('adapters by path, from the language table', () => {
  it('maps headers and sources to their language adapters', () => {
    expect(languageForPath('include/sensor.h')).toBe('c')
    expect(languageForPath('src/engine.hpp')).toBe('cpp')
    expect(adapterForPath('src/App.java')?.id).toBe('java')
    expect(adapterForPath('src/App.kt')?.id).toBe('kotlin')
    expect(adapterForPath('Sources/App.swift')).toBeNull()
    expect(adapterForPath('index.html')).toBeNull()
  })
})
