cmake_minimum_required(VERSION 3.16)
project(sensors LANGUAGES C)
add_executable(sensors src/main.c src/sensor.c src/filter.c src/log.c src/legacy_calib.c)
target_include_directories(sensors PRIVATE include)
