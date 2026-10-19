import test from "node:test";
import assert from "node:assert/strict";
import {
  containersFromBase,
  baseFromContainers,
  scaleRecipe,
  costBatch,
  residualToClear,
  money,
} from "../qbchem/costing.js";
import {
  chemicalInput,
  recipeInput,
  batchInput,
} from "../qbchem/policy.js";

test("containersFromBase floors whole containers and reports remainder", () => {
  assert.deepEqual(containersFromBase(410, 205), {
    containers: 2,
    remainderBase: 0,
    qtyBase: 410,
  });
  assert.deepEqual(containersFromBase(220, 205), {
    containers: 1,
    remainderBase: 15,
    qtyBase: 220,
  });
  assert.throws(() => containersFromBase(-1, 205));
  assert.throws(() => containersFromBase(10, 0));
});

test("baseFromContainers multiplies cleanly", () => {
  assert.equal(baseFromContainers(3, 1000), 3000);
  assert.throws(() => baseFromContainers(1.5, 1000));
});

test("scaleRecipe scales lines by output ratio", () => {
  const recipe = {
    outputQtyBase: 1000,
    lines: [
      { chemicalId: "a", qtyBase: 800 },
      { chemicalId: "b", qtyBase: 20 },
    ],
  };
  const scaled = scaleRecipe(recipe, 500);
  assert.equal(scaled.factor, 0.5);
  assert.equal(scaled.lines[0].qtyBase, 400);
  assert.equal(scaled.lines[1].qtyBase, 10);
  assert.throws(() => scaleRecipe(recipe, 0));
});

test("costBatch totals line costs and unit finished cost", () => {
  const costing = costBatch(
    [
      { chemicalId: "a", qtyBase: 800 },
      { chemicalId: "b", qtyBase: 20 },
    ],
    { a: 1.25, b: 10 },
    1000,
  );
  assert.equal(costing.costTotal, 1200);
  assert.equal(costing.costPerBase, 1.2);
  assert.equal(costing.consumed[0].cost, 1000);
  assert.equal(costing.consumed[1].cost, 200);
});

test("residualToClear rounds money", () => {
  assert.equal(residualToClear(0.004), 0);
  assert.equal(residualToClear(1.235), 1.24);
  assert.equal(money(1.005), 1.01);
});

test("chemicalInput validates kind, unit and container", () => {
  const c = chemicalInput({
    name: " Methanol ",
    kind: "raw",
    baseUnit: "L",
    containerType: "drum",
    containerCapacity: 205,
    purchaseCost: 1.5,
    unitPrice: 0,
  });
  assert.equal(c.name, "Methanol");
  assert.throws(() =>
    chemicalInput({
      name: "X",
      kind: "blend",
      baseUnit: "L",
      containerType: "drum",
      containerCapacity: 1,
    }),
  );
});

test("recipeInput and batchInput reject empty lines and bad ids", () => {
  assert.throws(() =>
    recipeInput({
      name: "R",
      finishedChemicalId: "f1",
      outputQtyBase: 1000,
      lines: [],
    }),
  );
  const r = recipeInput({
    name: "R",
    finishedChemicalId: "f1",
    outputQtyBase: 1000,
    lines: [{ chemicalId: "a", qtyBase: 10 }],
  });
  assert.equal(r.lines.length, 1);
  assert.equal(batchInput({ recipeId: "r1", outputQtyBase: 100 }).recipeId, "r1");
  assert.throws(() => batchInput({ recipeId: "", outputQtyBase: 100 }));
});
