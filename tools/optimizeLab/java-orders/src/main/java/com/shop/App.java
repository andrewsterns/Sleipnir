package com.shop;

import com.shop.orders.OrderService;

public class App {
    public static void main(String[] args) {
        new OrderService().place();
    }
}
