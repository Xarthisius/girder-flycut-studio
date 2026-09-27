// Laser-entry construction and the restore-from-import rule.
//
// makeLaser read `state.laserParams` and the module-level `palette` directly.
// Both are parameters now, which is the whole reason it can be exercised
// without standing up the builder.
export const PALETTE = ["#e6194b","#3c8d40","#4363d8","#e86818","#911eb4","#0075b5","#c51eb8","#24877f","#9a6324","#800000","#737300","#000075","#666666","#c9143c","#006400","#0000cd","#d83b00","#6a0dad","#007878","#a91270","#2f4f4f","#8b4513","#4b0082","#b22222","#228b22","#1674c5","#b85c16","#526574"];

export function makeLaser(values = {}, existing = [], palette = PALETTE) {
  const index = existing.length;
  const usedColors = new Set(existing.map(item => item.color.toLowerCase()));
  const nextColor = /^#[0-9a-f]{6}$/i.test(values.color || "") && !usedColors.has(values.color.toLowerCase()) ? values.color : palette.find(color => !usedColors.has(color.toLowerCase())) || palette[index];
  const laser = { id: crypto.randomUUID(), enabled: values.enabled !== false, name: `F${index + 1}`, color: nextColor, power: values.power ?? 60, speed: values.speed ?? 100, qpulsewidth: values.qpulsewidth ?? 200, frequency: values.frequency ?? 100, passes: values.passes ?? 1, fromImport: values.fromImport ?? false, locked: values.locked ?? false, importOriginal: values.importOriginal ?? null, isDefault: values.isDefault ?? values.is_default ?? false };
  if (laser.fromImport && !laser.importOriginal) laser.importOriginal = { power: Number(laser.power), speed: Number(laser.speed), qpulsewidth: Number(laser.qpulsewidth), frequency: Number(laser.frequency), passes: Number(laser.passes) };
  return laser;
}

export function restoreImportedLaser(laser) {
  Object.assign(laser, laser.importOriginal);
  laser.enabled = true;
  laser.locked = true;
}
