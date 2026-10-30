package com.shop.util;

import com.shop.orders.Order;

public class Money {
    public static Money of(Order order) {
        return new Money();
    }
}
