import { useEffect, useRef, useCallback } from "react";

const COUNT = 72;
const MAX_DIST = 160;
const ENTANGLE_DIST = 220;
const MOUSE_RADIUS = 130;
const MOUSE_STRENGTH = 0.012;
const CARD_BOOST_RADIUS = 260;

function makeParticles(w, h) {
    const particles = [];

    for (let i = 0; i < COUNT; i++) {
        particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.28,
            vy: (Math.random() - 0.5) * 0.28,
            radius: 1.5 + Math.random() * 2,
            phase: Math.random() * Math.PI * 2,
            phaseSpeed: 0.008 + Math.random() * 0.012,
            entangled: -1,
            activity: 0,
        });
    }

    // Assign entangled pairs
    for (let i = 0; i < COUNT; i++) {
        if (particles[i].entangled !== -1) continue;

        for (let j = i + 1; j < COUNT; j++) {
            if (particles[j].entangled !== -1) continue;

            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;

            if (
                Math.sqrt(dx * dx + dy * dy) < ENTANGLE_DIST &&
                Math.random() < 0.18
            ) {
                particles[i].entangled = j;
                particles[j].entangled = i;
                break;
            }
        }
    }

    return particles;
}

export default function QuantumBackground({
    isDark,
    activeCard,
    cardRects,
}) {
    const canvasRef = useRef(null);
    const mouse = useRef({ x: -9999, y: -9999 });
    const particlesRef = useRef([]);
    const rafRef = useRef(0);
    const reduced = useRef(false);

    function cardCenter(rect) {
        if (!rect) return null;

        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };
    }

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        const ps = particlesRef.current;

        const mx = mouse.current.x;
        const my = mouse.current.y;

        const activeCenters = ["clinician", "admin"]
            .filter((key) => key === activeCard)
            .map((key) => cardCenter(cardRects[key]))
            .filter(Boolean);

        ctx.clearRect(0, 0, W, H);

        // Update particles
        for (const p of ps) {
            if (!reduced.current) {
                p.phase += p.phaseSpeed;

                // Mouse repulsion
                const dxm = p.x - mx;
                const dym = p.y - my;
                const dm = Math.sqrt(dxm * dxm + dym * dym);

                if (dm < MOUSE_RADIUS && dm > 0.1) {
                    const force =
                        (1 - dm / MOUSE_RADIUS) * MOUSE_STRENGTH;

                    p.vx += (dxm / dm) * force;
                    p.vy += (dym / dm) * force;
                }

                // Card activity boost
                let targetActivity = 0;

                for (const cc of activeCenters) {
                    const dxc = p.x - cc.x;
                    const dyc = p.y - cc.y;
                    const dc = Math.sqrt(dxc * dxc + dyc * dyc);

                    if (dc < CARD_BOOST_RADIUS) {
                        targetActivity = Math.max(
                            targetActivity,
                            1 - dc / CARD_BOOST_RADIUS
                        );
                    }
                }

                p.activity +=
                    (targetActivity - p.activity) * 0.04;

                // Dampen and move
                p.vx *= 0.985;
                p.vy *= 0.985;

                p.x += p.vx;
                p.y += p.vy;

                // Wrap around screen
                if (p.x < -20) p.x = W + 20;
                else if (p.x > W + 20) p.x = -20;

                if (p.y < -20) p.y = H + 20;
                else if (p.y > H + 20) p.y = -20;
            }
        }

        const nodeColor = isDark
            ? [196, 90, 122]
            : [180, 60, 100];

        const lineColor = isDark
            ? [160, 60, 100]
            : [180, 80, 120];

        const entangleColor = isDark
            ? [220, 120, 160]
            : [200, 80, 130];

        // Draw connections
        for (let i = 0; i < ps.length; i++) {
            const a = ps[i];

            for (let j = i + 1; j < ps.length; j++) {
                const b = ps[j];

                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d = Math.sqrt(dx * dx + dy * dy);

                if (d < MAX_DIST) {
                    const base = 1 - d / MAX_DIST;
                    const boost =
                        (a.activity + b.activity) * 0.5;

                    const alpha =
                        base * (0.18 + boost * 0.22);

                    const [r, g, bl] = lineColor;

                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);

                    ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha.toFixed(
                        3
                    )})`;

                    ctx.lineWidth = 0.6 + boost * 0.6;
                    ctx.stroke();
                }
            }

            // Entangled pair
            if (a.entangled > i) {
                const b = ps[a.entangled];

                const dx = b.x - a.x;
                const dy = b.y - a.y;

                const d = Math.sqrt(dx * dx + dy * dy);

                const pulse =
                    0.5 + 0.5 * Math.sin(a.phase);

                const alpha = 0.08 + pulse * 0.12;

                const [r, g, bl] = entangleColor;

                ctx.beginPath();

                const cx =
                    (a.x + b.x) / 2 - dy * 0.18;

                const cy =
                    (a.y + b.y) / 2 + dx * 0.18;

                ctx.moveTo(a.x, a.y);
                ctx.quadraticCurveTo(
                    cx,
                    cy,
                    b.x,
                    b.y
                );

                ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha.toFixed(
                    3
                )})`;

                ctx.setLineDash([3, 5]);
                ctx.lineWidth = 0.8;
                ctx.stroke();
                ctx.setLineDash([]);

                if (d < ENTANGLE_DIST) {
                    const midX = (a.x + b.x) / 2;
                    const midY = (a.y + b.y) / 2;

                    ctx.beginPath();
                    ctx.arc(
                        midX,
                        midY,
                        1.2,
                        0,
                        Math.PI * 2
                    );

                    ctx.fillStyle = `rgba(${r},${g},${bl},${(
                        alpha * 1.5
                    ).toFixed(3)})`;

                    ctx.fill();
                }
            }
        }

        // Draw nodes
        for (const p of ps) {
            const pulse =
                0.5 + 0.5 * Math.sin(p.phase);

            const boost = p.activity;

            const r =
                p.radius *
                (0.9 + pulse * 0.25 + boost * 0.4);

            const alpha =
                0.35 +
                pulse * 0.2 +
                boost * 0.3;

            const [nr, ng, nb] = nodeColor;

            // Glow
            const grad = ctx.createRadialGradient(
                p.x,
                p.y,
                0,
                p.x,
                p.y,
                r * 4
            );

            grad.addColorStop(
                0,
                `rgba(${nr},${ng},${nb},${(
                    alpha * 0.5
                ).toFixed(3)})`
            );

            grad.addColorStop(
                1,
                `rgba(${nr},${ng},${nb},0)`
            );

            ctx.beginPath();
            ctx.arc(
                p.x,
                p.y,
                r * 4,
                0,
                Math.PI * 2
            );

            ctx.fillStyle = grad;
            ctx.fill();

            // Core dot
            ctx.beginPath();
            ctx.arc(
                p.x,
                p.y,
                r,
                0,
                Math.PI * 2
            );

            ctx.fillStyle = `rgba(${nr},${ng},${nb},${alpha.toFixed(
                3
            )})`;

            ctx.fill();
        }

        rafRef.current =
            requestAnimationFrame(draw);
    }, [isDark, activeCard, cardRects]);

    // Reduced motion
    useEffect(() => {
        reduced.current =
            window.matchMedia(
                "(prefers-reduced-motion: reduce)"
            ).matches;
    }, []);

    // Canvas resize
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            if (particlesRef.current.length === 0) {
                particlesRef.current = makeParticles(
                    canvas.width,
                    canvas.height
                );
            }
        }

        resize();

        window.addEventListener("resize", resize);

        return () =>
            window.removeEventListener(
                "resize",
                resize
            );
    }, []);

    // Mouse tracking
    useEffect(() => {
        function onMove(e) {
            mouse.current = {
                x: e.clientX,
                y: e.clientY,
            };
        }

        function onLeave() {
            mouse.current = {
                x: -9999,
                y: -9999,
            };
        }

        window.addEventListener(
            "mousemove",
            onMove
        );

        window.addEventListener(
            "mouseleave",
            onLeave
        );

        return () => {
            window.removeEventListener(
                "mousemove",
                onMove
            );

            window.removeEventListener(
                "mouseleave",
                onLeave
            );
        };
    }, []);

    // Start animation
    useEffect(() => {
        rafRef.current =
            requestAnimationFrame(draw);

        return () =>
            cancelAnimationFrame(
                rafRef.current
            );
    }, [draw]);

    return (
        <canvas
            ref={canvasRef}
            className="quantum-background"
            aria-hidden="true"
        />
    );
}