import "../Landing.css"; // holds the flower-* animation keyframes

// The animated pixel flower from the landing page, as a reusable logo.
// Petals breathe and flutter in steps, the centre pulses and light passes
// through the petals (all defined by the .flower-* classes in Landing.css).
export default function FlowerLogo({ size = 40, className = "" }) {
  return (
    <svg
      className={`flower-logo ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g className="flower-petal flower-petal--top">
        <path className="flower-outline" fill="#823653" d="M10 1h4v1h2v1h1v1h1v5h-1v1h-2v1H9v-1H8V9H7V4h1V3h1V2h1z" />
        <path className="flower-fill" fill="#e38aaa" d="M10 2h4v1h2v2h1v3h-1v1h-2v1h-4V9H9V8H8V5h1V3h1z" />
      </g>
      <g className="flower-petal flower-petal--right">
        <path className="flower-outline" fill="#823653" d="M16 5h4v1h2v1h1v2h1v4h-1v1h-1v1h-6v-1h-2v-1h-1V9h1V7h2z" />
        <path className="flower-fill" fill="#d9799c" d="M16 6h4v1h2v2h1v3h-1v1h-1v1h-5v-1h-2v-3h1V8h1z" />
      </g>
      <g className="flower-petal flower-petal--bottom-right">
        <path className="flower-outline" fill="#823653" d="M14 13h7v1h1v2h1v5h-1v2h-2v1h-5v-1h-2v-1h-1v-7h1v-1h1z" />
        <path className="flower-fill" fill="#d57498" d="M15 14h5v1h1v2h1v4h-1v1h-2v1h-4v-1h-1v-1h-1v-6h2z" />
      </g>
      <g className="flower-petal flower-petal--bottom-left">
        <path className="flower-outline" fill="#823653" d="M3 13h7v1h1v1h1v7h-1v1H9v1H4v-1H2v-2H1v-5h1v-2h1z" />
        <path className="flower-fill" fill="#dc7fa0" d="M4 14h5l2 2v5h-1v1H9v1H5v-1H3v-1H2v-4h1v-2h1z" />
      </g>
      <g className="flower-petal flower-petal--left">
        <path className="flower-outline" fill="#823653" d="M4 5h4l2 2v2h1v4h-1v1H8v1H2v-1H1v-1H0V9h1V7h1V6h2z" />
        <path className="flower-fill" fill="#df82a3" d="M4 6h4v1h1v2h1v3H8v1H3v-1H1V9h1V7h2z" />
      </g>

      <path className="flower-center-outline" fill="#823653" d="M10 9h4v1h1v4h-1v1h-4v-1H9v-4h1z" />
      <path className="flower-center" fill="#f2cbd9" d="M11 10h2v1h1v2h-1v1h-2v-1h-1v-2h1z" />

      <g className="flower-energy flower-energy--top"><path d="M10 3h2v1h-1v1h-1z" /></g>
      <g className="flower-energy flower-energy--right"><path d="M19 8h2v1h1v1h-2V9h-1z" /></g>
      <g className="flower-energy flower-energy--bottom-right"><path d="M18 18h1v2h-1v1h-1v-2h1z" /></g>
      <g className="flower-energy flower-energy--bottom-left"><path d="M5 18h1v2h1v1H5z" /></g>
      <g className="flower-energy flower-energy--left"><path d="M3 9h1V8h2v1H5v1H3z" /></g>
      <rect className="flower-center-highlight" x="11" y="11" width="1" height="1" />
    </svg>
  );
}
