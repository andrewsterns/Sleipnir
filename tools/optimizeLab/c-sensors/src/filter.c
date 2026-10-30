#include "filter.h"

double filter_apply(Filter *f, double value) {
    return f->alpha * value;
}
