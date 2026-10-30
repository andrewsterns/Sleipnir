package com.shop.orders;

public class OrderService {
    // Same package: Order needs no import.
    public Order place() {
        return new Order();
    }
}
