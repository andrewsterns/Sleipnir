#include <stdio.h>
#include "sensor.h"
#include "log.h"

int main(void) {
    Sensor s = {0};
    log_line("start");
    printf("%f\n", sensor_read(&s));
    return 0;
}
