#ifndef FILTER_H
#define FILTER_H

/* The planted include cycle: a filter only needs the sensor for its id. */
#include "sensor.h"

typedef struct Filter {
    double alpha;
} Filter;

double filter_apply(Filter *f, double value);

#endif
