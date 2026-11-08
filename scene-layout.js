// shared geometry keeps the startup ring aligned with the interactive core.
export function sceneLayout(width, height) {
  if (width <= 900) {
    return {
      scale: Math.min(width * 0.0015, height / 850, 1),
      x: width * 0.5,
      y: height * 0.42,
    };
  }

  return {
    scale: Math.min(width / 1672, height / 941),
    x: width * 0.495,
    y: height * 0.46,
  };
}
