// GLSL Fragment Shader — Animated Aurora

#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;

// Smooth noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
        u.y
    );
}

float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        val += amp * noise(p);
        p *= 2.1;
        amp *= 0.5;
    }
    return val;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv.x *= u_resolution.x / u_resolution.y;

    float t = u_time * 0.3;

    // Aurora bands
    float n = fbm(vec2(uv.x * 2.0 + t, uv.y * 0.5));
    float band = smoothstep(0.3, 0.7, uv.y + n * 0.4 - 0.2);
    float band2 = smoothstep(0.5, 0.9, uv.y + n * 0.3 + sin(t) * 0.1);

    // Colors
    vec3 col1 = vec3(0.0, 0.8, 0.6);   // teal
    vec3 col2 = vec3(0.3, 0.2, 0.9);   // purple
    vec3 col3 = vec3(0.0, 0.05, 0.15); // dark sky

    vec3 aurora = mix(col1, col2, band2) * band;
    vec3 sky = col3 + aurora * 0.8;

    // Stars
    float star = pow(hash(floor(uv * 200.0)), 20.0) * 0.8;
    sky += vec3(star) * (1.0 - band * 0.7);

    gl_FragColor = vec4(sky, 1.0);
}
