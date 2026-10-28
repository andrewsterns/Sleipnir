use crate::math::Vec2;

// Every body checked against every other, every step: O(n^2). Fine for 100
// bodies, a stall at 10,000. A spatial grid makes it ~O(n).
pub fn integrate(bodies: &mut [Vec2], dt: f32) {
    let snapshot = bodies.to_vec();
    for b in bodies.iter_mut() {
        let near = snapshot.iter().filter(|o| b.dist(**o) < 1.0).count();
        *b = b.add(Vec2 { x: 0.0, y: -9.8 }.scale(dt / near.max(1) as f32));
    }
}
