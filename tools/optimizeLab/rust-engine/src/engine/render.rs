use crate::math::Vec2;
use crate::util::describe_body;

pub fn draw(bodies: &[Vec2]) {
    for b in bodies {
        let _ = describe_body(b);
    }
}
