pub mod physics;
pub mod render;

use crate::math::Vec2;

#[derive(Default)]
pub struct World {
    pub bodies: Vec<Vec2>,
}

impl World {
    pub fn step(&mut self, dt: f32) {
        physics::integrate(&mut self.bodies, dt);
        render::draw(&self.bodies);
    }
}
