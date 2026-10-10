export interface OledScreenPosition {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export const OLED_SCREEN_SAFE_MARGIN = 24;

export function createRandomOledScreenPosition(
  width: number,
  height: number,
  elementWidth: number,
  elementHeight: number,
  random: () => number = Math.random
): OledScreenPosition {
  const maximumX = Math.max(0, width - elementWidth - OLED_SCREEN_SAFE_MARGIN * 2);
  const maximumY = Math.max(0, height - elementHeight - OLED_SCREEN_SAFE_MARGIN * 2);

  return {
    x: OLED_SCREEN_SAFE_MARGIN + random() * maximumX,
    y: OLED_SCREEN_SAFE_MARGIN + random() * maximumY,
    velocityX: random() < 0.5 ? -7 : 7,
    velocityY: random() < 0.5 ? -4 : 4,
  };
}

function advanceAxis(position: number, velocity: number, distance: number, maximum: number) {
  if (maximum <= 0) return { position: 0, velocity: 0 };

  let nextPosition = Math.min(maximum, Math.max(0, position)) + velocity * distance;
  let nextVelocity = velocity;
  while (nextPosition < 0 || nextPosition > maximum) {
    if (nextPosition < 0) {
      nextPosition = -nextPosition;
      nextVelocity = Math.abs(nextVelocity);
    } else {
      nextPosition = maximum - (nextPosition - maximum);
      nextVelocity = -Math.abs(nextVelocity);
    }
  }

  return { position: nextPosition, velocity: nextVelocity };
}

export function advanceOledScreenPosition(
  position: OledScreenPosition,
  elapsedSeconds: number,
  maximumX: number,
  maximumY: number
): OledScreenPosition {
  const nextX = advanceAxis(position.x, position.velocityX, elapsedSeconds, maximumX);
  const nextY = advanceAxis(position.y, position.velocityY, elapsedSeconds, maximumY);

  return {
    x: nextX.position,
    y: nextY.position,
    velocityX: nextX.velocity,
    velocityY: nextY.velocity,
  };
}
