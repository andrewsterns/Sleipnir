mod engine;
mod math;
mod util;

fn main() {
    let mut world = engine::World::default();
    for _ in 0..60 {
        world.step(1.0 / 60.0);
    }
    println!("{}", util::describe(&world));
}
