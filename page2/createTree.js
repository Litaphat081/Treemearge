export function generateTreeParameters(year, startYear) {

  let age = year - startYear;

  let height = 3 + age * 0.2;
  let branchCount = 5 + Math.floor(age * 0.5);
  let leafDensity = Math.min(1, age * 0.03);
  let trunkRadius = 0.5 + age * 0.02;

  return {
    height,
    branchCount,
    leafDensity,
    trunkRadius
  };
}
