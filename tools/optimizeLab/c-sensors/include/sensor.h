#ifndef SENSOR_H
#define SENSOR_H

#include "filter.h"

typedef struct Sensor {
    Filter filter;
    double last;
} Sensor;

double sensor_read(Sensor *s);

#endif
