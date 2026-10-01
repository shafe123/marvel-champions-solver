const aspectColors = {
  Aggression: "aggression",
  Justice: "justice",
  Protection: "protection",
  Leadership: "leadership",
  "'Pool": "pool",
};

export function aspectColorClass(aspect) {
  const color = aspectColors[aspect];
  return color ? `aspect-${color}` : "";
}

export { aspectColors };
