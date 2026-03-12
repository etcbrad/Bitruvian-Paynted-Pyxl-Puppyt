
/**
 * Kinematics logic has been moved to App.tsx and Mannequin.tsx 
 * for improved performance and simpler state management.
 */
export const lerp = (start: number, end: number, t: number): number => start * (1 - t) + end * t;

export const easeInOutQuint = (t: number): number => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
};
