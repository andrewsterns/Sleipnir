// A "util" that depends on the engine (World) — and the engine's renderer
// depends on this util. Rust allows module cycles inside a crate, but it is the
// same tangle: neither can be understood, tested or moved without the other.
use crate::engine::World;
use crate::math::Vec2;

pub fn describe(world: &World) -> String {
    format!("{} bodies", world.bodies.len())
}

pub fn describe_body(b: &Vec2) -> String {
    format!("({:.1}, {:.1})", b.x, b.y)
}
