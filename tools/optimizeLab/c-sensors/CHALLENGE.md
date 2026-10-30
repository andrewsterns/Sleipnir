# Challenge: c-sensors

A small C program built with CMake, headers in `include/`, sources in `src/`.

    node ../../agentSkills/vendor/analyze.mjs report --root .

## Planted problems — what /optimize should find

1. **An include cycle.** `include/sensor.h` includes `filter.h`, and `filter.h` includes
   `sensor.h` back. The guards stop infinite inclusion, but neither header can be used
   alone and every change to one recompiles everything that includes the other. Fix: a
   forward declaration (`typedef struct Sensor Sensor;`) in `filter.h` instead of the include.
2. **Dead code.** `src/legacy_calib.c` has no header and nothing calls it.

Sources that implement a header (`sensor.c` for `sensor.h`) are never reported unused:
nothing includes a `.c`, the build links it.
