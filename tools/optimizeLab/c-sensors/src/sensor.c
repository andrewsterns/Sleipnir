#include "sensor.h"
#include "log.h"

double sensor_read(Sensor *s) {
    log_line("read");
    s->last = filter_apply(&s->filter, 1.0);
    return s->last;
}
