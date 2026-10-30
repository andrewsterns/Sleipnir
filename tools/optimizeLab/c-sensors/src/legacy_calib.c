/* No header and nothing calls it: an old calibration routine. */
#include "sensor.h"

double legacy_calibrate(Sensor *s) {
    return s->last * 1.02;
}
