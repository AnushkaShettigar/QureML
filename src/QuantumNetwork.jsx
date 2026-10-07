import React from "react";
import { useEffect, useRef } from "react";
const PANEL = { x: 0.331, y: 0.1455, width: 0.3393, height: 0.6962 };
function seededRandom(seed) {
  let value = seed;
  return () => {
    value += 1831565813;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}
function QuantumNetwork() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const random = seededRandom(4173);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = [];
    const signals = [];
    const ripples = [];
    const mouse = { x: -1e3, y: -1e3, active: false, down: false };
    let width = 0;
    let height = 0;
    let frame = 0;
    let previousTime = performance.now();
    let lastSignalTime = 0;
    let nextAutonomousSignalAt = performance.now() + 250 + random() * 450;
    let quantumPacket = null;
    let nextPacketAt = performance.now() + 3e3 + random() * 3500;
    const panelBounds = () => ({
      x: width * PANEL.x,
      y: height * PANEL.y,
      width: width * PANEL.width,
      height: height * PANEL.height
    });
    const isInsidePanel = (x, y, padding = 0) => {
      const panel = panelBounds();
      return x > panel.x - padding && x < panel.x + panel.width + padding && y > panel.y - padding && y < panel.y + panel.height + padding;
    };
    const createNodes = () => {
      nodes.length = 0;
      const count = Math.max(50, Math.min(94, Math.round(width * height / 18e3)));
      const clusterCenters = [
        { x: 0.08, y: 0.16 },
        { x: 0.22, y: 0.3 },
        { x: 0.1, y: 0.55 },
        { x: 0.22, y: 0.79 },
        { x: 0.45, y: 0.07 },
        { x: 0.55, y: 0.93 },
        { x: 0.78, y: 0.2 },
        { x: 0.91, y: 0.38 },
        { x: 0.79, y: 0.7 },
        { x: 0.93, y: 0.84 }
      ];
      for (let index = 0; index < count; index += 1) {
        let cluster = clusterCenters[index % clusterCenters.length];
        let angle = random() * Math.PI * 2;
        let radius = 24 + random() * Math.min(105, Math.min(width, height) * 0.14);
        let x = cluster.x * width + Math.cos(angle) * radius;
        let y = cluster.y * height + Math.sin(angle) * radius;
        let attempts = 0;
        while ((isInsidePanel(x, y, 24) || x < 6 || x > width - 6 || y < 6 || y > height - 6) && attempts < 30) {
          cluster = clusterCenters[(index + attempts + 1) % clusterCenters.length];
          angle = random() * Math.PI * 2;
          radius = 24 + random() * Math.min(105, Math.min(width, height) * 0.14);
          x = cluster.x * width + Math.cos(angle) * radius;
          y = cluster.y * height + Math.sin(angle) * radius;
          attempts += 1;
        }
        const movementAngle = random() * Math.PI * 2;
        const speed = 4.5 + random() * 6;
        nodes.push({
          x,
          y,
          vx: Math.cos(movementAngle) * speed,
          vy: Math.sin(movementAngle) * speed,
          phase: random() * Math.PI * 2,
          drift: 0.18 + random() * 0.28,
          size: (0.8 + random() * 1.35) * 1.62,
          pulse: 0,
          burst: 0
        });
      }
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      createNodes();
    };
    const updatePointer = (event) => {
      const bounds = canvas.getBoundingClientRect();
      mouse.x = event.clientX - bounds.left;
      mouse.y = event.clientY - bounds.top;
      mouse.active = mouse.x >= 0 && mouse.x <= bounds.width && mouse.y >= 0 && mouse.y <= bounds.height;
    };
    const deactivatePointer = () => {
      mouse.active = false;
    };
    const createRepulsionBurst = (event) => {
      if (event.button !== 0) return;
      updatePointer(event);
      if (!mouse.active || isInsidePanel(mouse.x, mouse.y)) return;
      mouse.down = true;
      const radius = 165;
      nodes.forEach((node) => {
        const dx = node.x - mouse.x;
        const dy = node.y - mouse.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius || distance < 0.1) return;
        const proximity = 1 - distance / radius;
        const impulse = 11 + proximity * 22;
        node.vx += dx / distance * impulse;
        node.vy += dy / distance * impulse;
        node.burst = Math.max(node.burst, proximity);
        node.pulse = Math.max(node.pulse, proximity * 0.72);
      });
      ripples.push({ x: mouse.x, y: mouse.y, age: 0, duration: 0.62 });
      if (ripples.length > 2) ripples.shift();
    };
    const releaseRepulsion = () => {
      mouse.down = false;
    };
    const keepOutsidePanel = (node) => {
      if (!isInsidePanel(node.x, node.y, 8)) return;
      const panel = panelBounds();
      const distances = [
        { value: Math.abs(node.x - panel.x), side: "left" },
        { value: Math.abs(node.x - (panel.x + panel.width)), side: "right" },
        { value: Math.abs(node.y - panel.y), side: "top" },
        { value: Math.abs(node.y - (panel.y + panel.height)), side: "bottom" }
      ].sort((first, second) => first.value - second.value);
      switch (distances[0].side) {
        case "left":
          node.x = panel.x - 9;
          node.vx = -Math.abs(node.vx);
          break;
        case "right":
          node.x = panel.x + panel.width + 9;
          node.vx = Math.abs(node.vx);
          break;
        case "top":
          node.y = panel.y - 9;
          node.vy = -Math.abs(node.vy);
          break;
        default:
          node.y = panel.y + panel.height + 9;
          node.vy = Math.abs(node.vy);
      }
    };
    const updateNodes = (time, delta) => {
      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;
      const cursorRadius = 155;
      const panelResponsive = mouse.active && isInsidePanel(mouse.x, mouse.y, 24);
      const panel = panelBounds();
      const nodeDistances = mouse.active ? nodes.map((node, index) => ({
        index,
        distance: Math.hypot(node.x - mouse.x, node.y - mouse.y)
      })).sort((first, second) => first.distance - second.distance) : [];
      const reactiveNodes = nodeDistances.filter((entry) => entry.distance < cursorRadius).slice(0, 4);
      const reactiveRanks = new Map(
        reactiveNodes.map((entry, rank) => [entry.index, { rank, distance: entry.distance }])
      );
      if (nodeDistances.length > 0) {
        closestIndex = nodeDistances[0].index;
        closestDistance = nodeDistances[0].distance;
      }
      nodes.forEach((node, index) => {
        const seconds = time / 1e3;
        const isPacketNode = quantumPacket?.nodeIndex === index && time - quantumPacket.startedAt < quantumPacket.duration;
        node.vx += Math.sin(seconds * node.drift + node.phase) * delta * 1.7;
        node.vy += Math.cos(seconds * node.drift * 0.83 + node.phase * 1.37) * delta * 1.7;
        if (isPacketNode && quantumPacket) {
          const progress = (time - quantumPacket.startedAt) / quantumPacket.duration;
          const targetSpeed = progress < 0.18 ? 13 + progress / 0.18 * 53 : progress < 0.72 ? 66 : 66 - (progress - 0.72) / 0.28 * 53;
          const currentSpeed = Math.max(0.1, Math.hypot(node.vx, node.vy));
          const speed2 = currentSpeed + (targetSpeed - currentSpeed) * Math.min(1, delta * 6);
          node.vx = node.vx / currentSpeed * speed2;
          node.vy = node.vy / currentSpeed * speed2;
        }
        const reaction = reactiveRanks.get(index);
        const missileDx = node.x - mouse.x;
        const missileDy = node.y - mouse.y;
        const missileDistance = Math.hypot(missileDx, missileDy);
        const missileActive = mouse.down && mouse.active && missileDistance > 0.1 && missileDistance < 245;
        if (missileActive) {
          const proximity = 1 - missileDistance / 245;
          const force = 40 + proximity * 225;
          node.vx += missileDx / missileDistance * force * delta;
          node.vy += missileDy / missileDistance * force * delta;
          node.burst = Math.max(node.burst, 1.9 + proximity * 1.1);
          node.pulse = Math.max(node.pulse, 0.45 + proximity * 0.45);
        }
        if (reaction) {
          const dx = node.x - mouse.x;
          const dy = node.y - mouse.y;
          const distance = Math.max(0.1, reaction.distance);
          const proximity = 1 - distance / cursorRadius;
          const rankStrength = reaction.rank === 0 ? 1 : Math.max(0.28, 0.62 - reaction.rank * 0.1);
          const force = proximity * 118 * rankStrength;
          node.vx += dx / distance * force * delta;
          node.vy += dy / distance * force * delta;
          if (reaction.rank > 0) {
            const disturbance = force * 0.12 * delta;
            node.vx += -dy / distance * disturbance;
            node.vy += dx / distance * disturbance;
          }
        }
        if (panelResponsive) {
          const dx = Math.max(panel.x - node.x, 0, node.x - (panel.x + panel.width));
          const dy = Math.max(panel.y - node.y, 0, node.y - (panel.y + panel.height));
          const panelDistance = Math.hypot(dx, dy);
          if (panelDistance < 115) {
            const response = 1 + (1 - panelDistance / 115) * 0.035 * delta;
            node.vx *= response;
            node.vy *= response;
          }
        }
        const speed = Math.hypot(node.vx, node.vy);
        const maximumSpeed = isPacketNode ? 70 : missileActive ? 85 : node.burst > 0 ? 13 + Math.min(3, node.burst) * 23 : reaction ? reaction.rank === 0 ? 29 : 19 : 13;
        if (speed > maximumSpeed) {
          const scale = reaction ? maximumSpeed / speed : Math.max(maximumSpeed / speed, Math.pow(0.08, delta));
          node.vx *= scale;
          node.vy *= scale;
        }
        node.x += node.vx * delta;
        node.y += node.vy * delta;
        node.pulse = Math.max(0, node.pulse - delta * 1.35);
        node.burst = Math.max(0, node.burst - delta * 1.35);
        if (node.x < 4) {
          node.x = 4;
          node.vx = Math.abs(node.vx);
        } else if (node.x > width - 4) {
          node.x = width - 4;
          node.vx = -Math.abs(node.vx);
        }
        if (node.y < 4) {
          node.y = 4;
          node.vy = Math.abs(node.vy);
        } else if (node.y > height - 4) {
          node.y = height - 4;
          node.vy = -Math.abs(node.vy);
        }
        keepOutsidePanel(node);
        if (isPacketNode && quantumPacket) {
          quantumPacket.history.push({ x: node.x, y: node.y, life: 1 });
          let trailLength = 0;
          for (let point = quantumPacket.history.length - 1; point > 0; point -= 1) {
            const current = quantumPacket.history[point];
            const previous = quantumPacket.history[point - 1];
            trailLength += Math.hypot(current.x - previous.x, current.y - previous.y);
            if (trailLength > 120) {
              quantumPacket.history.splice(0, point);
              break;
            }
          }
          if (quantumPacket.history.length > 110) quantumPacket.history.shift();
          nodes.forEach((neighbor, neighborIndex) => {
            if (neighborIndex === index) return;
            const distance = Math.hypot(node.x - neighbor.x, node.y - neighbor.y);
            if (distance < 72) {
              neighbor.pulse = Math.max(neighbor.pulse, (1 - distance / 72) * 0.72);
            }
          });
        }
      });
      return {
        closestIndex,
        closestDistance,
        activeIndex: closestDistance < cursorRadius || panelResponsive && closestDistance < 220 ? closestIndex : -1
      };
    };
    const buildEdges = (activeIndex, time) => {
      const edges = [];
      const standardDistance = Math.min(160, Math.max(118, Math.min(width, height) * 0.18));
      for (let first = 0; first < nodes.length; first += 1) {
        for (let second = first + 1; second < nodes.length; second += 1) {
          const dx = nodes[first].x - nodes[second].x;
          const dy = nodes[first].y - nodes[second].y;
          const distance = Math.hypot(dx, dy);
          const entangled = (first * 19 + second * 23) % 71 === 0;
          const limit = entangled ? standardDistance * 1.55 : standardDistance;
          const sparse = entangled || (first * 31 + second * 17) % 10 < 3;
          if (!sparse || distance >= limit) continue;
          const active = first === activeIndex || second === activeIndex;
          const packetConnection = quantumPacket !== null && (first === quantumPacket.nodeIndex || second === quantumPacket.nodeIndex) && time - quantumPacket.startedAt < quantumPacket.duration;
          const pulse = Math.max(nodes[first].pulse, nodes[second].pulse);
          if (active) {
            const neighbor = first === activeIndex ? second : first;
            nodes[neighbor].pulse = Math.max(nodes[neighbor].pulse, 0.2);
          }
          edges.push({
            a: first,
            b: second,
            alpha: (1 - distance / limit) * (active ? 0.74 : packetConnection ? 0.58 : 0.13) + pulse * 0.22
          });
        }
      }
      return edges;
    };
    const draw = (time, edges, activeIndex) => {
      context.clearRect(0, 0, width, height);
      const panel = panelBounds();
      context.save();
      context.beginPath();
      context.rect(0, 0, width, height);
      context.rect(panel.x, panel.y, panel.width, panel.height);
      context.clip("evenodd");
      edges.forEach((edge) => {
        const start = nodes[edge.a];
        const end = nodes[edge.b];
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.strokeStyle = `rgba(190, 73, 119, ${Math.min(0.52, edge.alpha)})`;
        context.lineWidth = edge.a === activeIndex || edge.b === activeIndex ? 0.8 : 0.45;
        context.stroke();
      });
      ripples.forEach((ripple) => {
        const progress = ripple.age / ripple.duration;
        context.beginPath();
        context.arc(ripple.x, ripple.y, 12 + progress * 145, 0, Math.PI * 2);
        context.strokeStyle = `rgba(221, 119, 158, ${(1 - progress) * 0.24})`;
        context.lineWidth = 0.8;
        context.stroke();
      });
      if (quantumPacket && quantumPacket.history.length > 1) {
        const history = quantumPacket.history;
        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        context.shadowColor = "rgba(218, 91, 139, 0.48)";
        context.shadowBlur = 8;
        for (let index = 1; index < history.length; index += 1) {
          const start = history[index - 1];
          const end = history[index];
          const taper = index / (history.length - 1);
          const alpha = Math.min(start.life, end.life) * taper;
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.lineWidth = 0.65 + taper * 5.4;
          context.strokeStyle = `rgba(226, 104, 151, ${alpha * 0.76})`;
          context.stroke();
          context.lineWidth = 0.4 + taper * 1.15;
          context.strokeStyle = `rgba(255, 226, 237, ${alpha * 0.94})`;
          context.stroke();
        }
        context.restore();
      }
      signals.forEach((signal) => {
        if (signal.history.length > 1) {
          context.save();
          context.lineCap = "round";
          context.lineJoin = "round";
          context.shadowColor = "rgba(231, 126, 165, 0.5)";
          context.shadowBlur = 6;
          for (let index = 1; index < signal.history.length; index += 1) {
            const previous = signal.history[index - 1];
            const current = signal.history[index];
            const taper = index / (signal.history.length - 1);
            const alpha = Math.min(previous.life, current.life) * taper;
            context.beginPath();
            context.moveTo(previous.x, previous.y);
            context.lineTo(current.x, current.y);
            context.lineWidth = 0.35 + taper * 2.5;
            context.strokeStyle = `rgba(226, 112, 155, ${alpha * 0.78})`;
            context.stroke();
            context.lineWidth = 0.25 + taper * 0.75;
            context.strokeStyle = `rgba(255, 230, 239, ${alpha * 0.92})`;
            context.stroke();
          }
          context.restore();
        }
        if (signal.arrived) return;
        const start = nodes[signal.a];
        const end = nodes[signal.b];
        const x = start.x + (end.x - start.x) * signal.progress;
        const y = start.y + (end.y - start.y) * signal.progress;
        const gradient = context.createRadialGradient(x, y, 0, x, y, 7);
        gradient.addColorStop(0, "rgba(255, 232, 241, 0.9)");
        gradient.addColorStop(0.26, "rgba(247, 177, 203, 0.72)");
        gradient.addColorStop(1, "rgba(190, 73, 119, 0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, 7, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255, 239, 245, 0.94)";
        context.beginPath();
        context.arc(x, y, 1.45, 0, Math.PI * 2);
        context.fill();
      });
      nodes.forEach((node, index) => {
        const distance = mouse.active ? Math.hypot(node.x - mouse.x, node.y - mouse.y) : 999;
        const proximity = Math.max(0, 1 - distance / 155);
        const isClosest = index === activeIndex;
        const isPacketHead = quantumPacket?.nodeIndex === index && time - quantumPacket.startedAt < quantumPacket.duration;
        const brightness = 0.2 + proximity * 0.58 + node.pulse * 0.4 + (isPacketHead ? 0.42 : 0);
        const size = node.size + proximity * 1.45 + (isClosest ? 1.45 : 0) + (isPacketHead ? 0.9 : 0);
        const glowRadius = size * (isClosest || isPacketHead ? 5.2 : 4.3);
        const glow = context.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
        glow.addColorStop(
          0,
          `rgba(255, 212, 228, ${Math.min(0.92, brightness + (isClosest ? 0.18 : 0))})`
        );
        glow.addColorStop(0.24, `rgba(224, 104, 151, ${brightness * 0.48})`);
        glow.addColorStop(1, "rgba(152, 45, 87, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(249, 188, 211, ${Math.min(0.9, brightness + 0.12)})`;
        context.beginPath();
        context.arc(node.x, node.y, Math.max(0.65, size * (isClosest ? 0.62 : 0.5)), 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    };
    const animate = (time) => {
      const delta = Math.min(0.034, (time - previousTime) / 1e3);
      previousTime = time;
      if (!reducedMotion && !quantumPacket && time >= nextPacketAt && nodes.length > 0) {
        const candidates = nodes.map((node, index) => ({ node, index })).filter(({ node }) => !isInsidePanel(node.x, node.y, 100));
        const selected = candidates[Math.floor(random() * candidates.length)];
        if (selected) {
          quantumPacket = {
            nodeIndex: selected.index,
            startedAt: time,
            duration: 1350 + random() * 500,
            lastTransferAt: 0,
            history: []
          };
        }
      }
      if (quantumPacket) {
        quantumPacket.history.forEach((point) => {
          point.life = Math.max(0, point.life - delta * 0.65);
        });
        while (quantumPacket.history[0]?.life === 0) quantumPacket.history.shift();
      }
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        ripples[index].age += delta;
        if (ripples[index].age >= ripples[index].duration) ripples.splice(index, 1);
      }
      const active = updateNodes(time, reducedMotion ? 0 : delta);
      const edges = buildEdges(active.activeIndex, time);
      const travellingSignals = signals.filter((signal) => !signal.arrived).length;
      if (!reducedMotion && active.activeIndex < 0 && time >= nextAutonomousSignalAt && travellingSignals < 3 && edges.length > 0) {
        const availableEdges = edges.filter(
          (edge) => !signals.some(
            (signal) => !signal.arrived && (signal.a === edge.a && signal.b === edge.b || signal.a === edge.b && signal.b === edge.a)
          )
        ).sort((first, second) => {
          const firstLength = Math.hypot(
            nodes[first.a].x - nodes[first.b].x,
            nodes[first.a].y - nodes[first.b].y
          );
          const secondLength = Math.hypot(
            nodes[second.a].x - nodes[second.b].x,
            nodes[second.a].y - nodes[second.b].y
          );
          return firstLength - secondLength;
        });
        const preferredPool = availableEdges.slice(
          0,
          Math.max(1, Math.ceil(availableEdges.length * 0.6))
        );
        const selectedEdge = preferredPool[Math.floor(random() * preferredPool.length)];
        if (selectedEdge) {
          const forward = random() > 0.5;
          signals.push({
            a: forward ? selectedEdge.a : selectedEdge.b,
            b: forward ? selectedEdge.b : selectedEdge.a,
            progress: 0,
            speed: 0.56 + random() * 0.16,
            hops: random() < 0.28 ? 1 : 0,
            arrived: false,
            history: []
          });
        }
        nextAutonomousSignalAt = time + 350 + random() * 650;
      }
      if (quantumPacket && time - quantumPacket.startedAt < quantumPacket.duration && time - quantumPacket.lastTransferAt > 420) {
        const packetEdge = edges.find(
          (edge) => edge.a === quantumPacket?.nodeIndex || edge.b === quantumPacket?.nodeIndex
        );
        if (packetEdge && signals.length < 3) {
          const forward = packetEdge.a === quantumPacket.nodeIndex;
          signals.push({
            a: forward ? packetEdge.a : packetEdge.b,
            b: forward ? packetEdge.b : packetEdge.a,
            progress: 0,
            speed: 0.78,
            hops: 0,
            arrived: false,
            history: []
          });
          quantumPacket.lastTransferAt = time;
        }
      }
      if (active.activeIndex >= 0 && time - lastSignalTime > 540 && signals.length < 5) {
        const candidates = edges.filter(
          (edge) => edge.a === active.activeIndex || edge.b === active.activeIndex
        );
        candidates.slice(0, 3).forEach((edge, index) => {
          const forward = edge.a === active.activeIndex;
          signals.push({
            a: forward ? edge.a : edge.b,
            b: forward ? edge.b : edge.a,
            progress: 0,
            speed: 0.72 + index * 0.08,
            hops: 1,
            arrived: false,
            history: []
          });
        });
        if (candidates.length > 0) lastSignalTime = time;
      }
      const chainedSignals = [];
      for (let index = signals.length - 1; index >= 0; index -= 1) {
        const signal = signals[index];
        signal.history.forEach((point) => {
          point.life = Math.max(0, point.life - delta * 1.35);
        });
        while (signal.history[0]?.life === 0) signal.history.shift();
        if (!signal.arrived) {
          signal.progress = Math.min(1, signal.progress + delta * signal.speed);
          const start = nodes[signal.a];
          const end = nodes[signal.b];
          signal.history.push({
            x: start.x + (end.x - start.x) * signal.progress,
            y: start.y + (end.y - start.y) * signal.progress,
            life: 1
          });
          let trailLength = 0;
          for (let point = signal.history.length - 1; point > 0; point -= 1) {
            const current = signal.history[point];
            const previous = signal.history[point - 1];
            trailLength += Math.hypot(current.x - previous.x, current.y - previous.y);
            if (trailLength > 70) {
              signal.history.splice(0, point);
              break;
            }
          }
          if (signal.history.length > 70) signal.history.shift();
        }
        if (!signal.arrived && signal.progress >= 1) {
          const completed = signal;
          completed.arrived = true;
          nodes[completed.b].pulse = 1;
          if (completed.hops > 0) {
            const nextEdge = edges.find(
              (edge) => (edge.a === completed.b || edge.b === completed.b) && edge.a !== completed.a && edge.b !== completed.a
            );
            if (nextEdge) {
              const forward = nextEdge.a === completed.b;
              chainedSignals.push({
                a: forward ? nextEdge.a : nextEdge.b,
                b: forward ? nextEdge.b : nextEdge.a,
                progress: 0,
                speed: completed.speed * 0.92,
                hops: completed.hops - 1,
                arrived: false,
                history: []
              });
            }
          }
        }
        if (signal.arrived && signal.history.length === 0) {
          signals.splice(index, 1);
        }
      }
      signals.push(...chainedSignals.slice(0, Math.max(0, 6 - signals.length)));
      draw(time, edges, active.activeIndex);
      if (quantumPacket && time - quantumPacket.startedAt >= quantumPacket.duration && quantumPacket.history.length === 0) {
        quantumPacket = null;
        nextPacketAt = time + 4200 + random() * 4800;
      }
      frame = window.requestAnimationFrame(animate);
    };
    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", updatePointer, { passive: true });
    canvas.addEventListener("pointerdown", createRepulsionBurst);
    canvas.addEventListener("pointerleave", deactivatePointer);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerup", releaseRepulsion);
    window.addEventListener("pointercancel", releaseRepulsion);
    window.addEventListener("blur", releaseRepulsion);
    document.addEventListener("mouseleave", deactivatePointer);
    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", updatePointer);
      canvas.removeEventListener("pointerdown", createRepulsionBurst);
      canvas.removeEventListener("pointerleave", deactivatePointer);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerup", releaseRepulsion);
      window.removeEventListener("pointercancel", releaseRepulsion);
      window.removeEventListener("blur", releaseRepulsion);
      document.removeEventListener("mouseleave", deactivatePointer);
    };
  }, []);
  return <canvas ref={canvasRef} className="quantum-network" aria-hidden="true" />;
}
export {
  QuantumNetwork as default
};
