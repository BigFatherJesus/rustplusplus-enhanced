/*
    Copyright (C) 2024 Nuallan Lampe (BigFatherJesus)
    Enhanced fork of rustplusplus by Alexander Emanuelsson (alexemanuelol)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    https://github.com/alexemanuelol/rustplusplus

*/

/*
    Shared builder that turns raw rustlabsDurabilityData records into the grouped
    destroyOptions object served to the AI assistant:
    { explosives: [...], gunsAndAmmo: [...], meleeAndTools: [...], note }

    Used by aiExport.js (AI/items per-item files) and knowledge.js (no-tools static
    context) so both paths give identical answers.
*/

const MAX_EXPLOSIVES = 12;
const MAX_AMMO = 12;
const MAX_MELEE = 8;
/* Above this count a method is theoretical filler, not a usable raid option. */
const MAX_PRACTICAL_QUANTITY = 10000;

const EXPLOSIVE_NAME_RE = /(c4|timed explosive|rocket|satchel|beancan|grenade|molotov|explosive 5\.56|mlrs)/i;

const NOTE =
    'gunsAndAmmo quantities are for the most efficient listed weapon and vary slightly per weapon. ' +
    'soft side = the weak smooth side of a block, hard side = the strong side. ' +
    'Methods not listed here may still work — the data just does not include them.';

/**
 *  @param {Object} record A durability record.
 *  @return {number} Sort key: sulfur cost, falling back past all sulfur costs by time.
 */
function bySulfurThenTime(a, b) {
    const sa = a.sulfurCost ?? Infinity;
    const sb = b.sulfurCost ?? Infinity;
    if (sa !== sb) return sa - sb;
    return (a.timeSeconds ?? Infinity) - (b.timeSeconds ?? Infinity);
}

/**
 *  Build the base row shared by all groups.
 *  @param {Object} record The durability record.
 *  @param {function} nameOf Resolve numeric tool id -> display name.
 *  @return {Object} The base row.
 */
function baseRow(record, nameOf) {
    return {
        tool: nameOf(record.toolId),
        variant: record.caption || undefined,
        quantity: record.quantity,
        side: record.which && record.which !== 'both' ? record.which : undefined,
        sulfurCost: record.sulfur ?? undefined,
        timeSeconds: typeof record.time === 'number' ? record.time : undefined,
        time: record.timeString || undefined
    };
}

/**
 *  Build the explosives group: genuine raid explosives, deduped, with explosive 5.56
 *  collapsed to its single cheapest weapon entry.
 *  @param {Array} records The durability records.
 *  @param {function} nameOf Resolve tool id -> name.
 *  @return {Array} The group rows.
 */
function buildExplosives(records, nameOf) {
    const rows = [];
    let bestExplosiveAmmo = null;
    const seen = new Set();

    for (const record of records) {
        const tool = nameOf(record.toolId);
        const label = `${tool} ${record.caption || ''}`;
        const isExplosiveGroup = record.group === 'explosive' || record.group === 'throw';
        if (!isExplosiveGroup && !EXPLOSIVE_NAME_RE.test(label)) continue;

        /* Explosive 5.56 fired from any gun is one method — keep the cheapest. */
        if (/explosive 5\.56/i.test(label)) {
            const candidate = {
                ...baseRow(record, nameOf),
                tool: 'Explosive 5.56 Rifle Ammo',
                variant: `via ${tool}`
            };
            if (!bestExplosiveAmmo ||
                (candidate.sulfurCost ?? Infinity) < (bestExplosiveAmmo.sulfurCost ?? Infinity)) {
                bestExplosiveAmmo = candidate;
            }
            continue;
        }

        const row = baseRow(record, nameOf);
        const key = `${row.tool}|${row.variant || ''}|${row.side || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
    }

    if (bestExplosiveAmmo) rows.push(bestExplosiveAmmo);
    rows.sort(bySulfurThenTime);
    return rows.slice(0, MAX_EXPLOSIVES);
}

/**
 *  Merge a tool's hard/soft record pair into one row with both quantities.
 *  @param {Object} base The base row (from the preferred record).
 *  @param {Object|null} hard The hard-side record (or null).
 *  @param {Object|null} soft The soft-side record (or null).
 *  @return {Object} The merged row.
 */
function mergeSides(base, hard, soft) {
    const row = { ...base };
    delete row.side;
    delete row.quantity;
    if (hard && soft) {
        row.quantityHardSide = hard.quantity;
        row.quantitySoftSide = soft.quantity;
        row.sulfurCost = hard.sulfur ?? soft.sulfur ?? undefined;
    }
    else {
        const only = hard || soft;
        row.quantity = only.quantity;
        if (only.which === 'hard' || only.which === 'soft') row.side = only.which;
    }
    return row;
}

/**
 *  Build the gunsAndAmmo group: one entry per ammo type, using the weapon that needs
 *  the fewest rounds, with hard/soft quantities merged.
 *  @param {Array} records The durability records.
 *  @param {function} nameOf Resolve tool id -> name.
 *  @return {Array} The group rows.
 */
function buildGunsAndAmmo(records, nameOf) {
    /* ammo caption -> tool name -> { hard, soft, any } records */
    const byAmmo = new Map();
    for (const record of records) {
        if (record.group !== 'guns' || !record.caption) continue;
        if (/explosive 5\.56/i.test(record.caption)) continue; /* lives in explosives */
        if (record.quantity > MAX_PRACTICAL_QUANTITY) continue;
        const tool = nameOf(record.toolId);
        if (!byAmmo.has(record.caption)) byAmmo.set(record.caption, new Map());
        const byTool = byAmmo.get(record.caption);
        if (!byTool.has(tool)) byTool.set(tool, { hard: null, soft: null, any: null });
        const slot = byTool.get(tool);
        if (record.which === 'hard') slot.hard = record;
        else if (record.which === 'soft') slot.soft = record;
        else slot.any = record;
    }

    const rows = [];
    for (const [ammo, byTool] of byAmmo.entries()) {
        /* Pick the weapon needing the fewest rounds (hard side as reference). */
        let best = null;
        for (const [tool, slot] of byTool.entries()) {
            const ref = slot.hard || slot.any || slot.soft;
            if (!ref) continue;
            if (!best || ref.quantity < best.ref.quantity) best = { tool, slot, ref };
        }
        if (!best) continue;

        const row = mergeSides(
            { ...baseRow(best.ref, nameOf), tool: undefined, ammo, weapon: best.tool },
            best.slot.hard, best.slot.soft || best.slot.any
        );
        delete row.tool;
        delete row.variant;
        rows.push(row);
    }

    rows.sort(bySulfurThenTime);
    return rows.slice(0, MAX_AMMO);
}

/**
 *  Build the meleeAndTools group: best (lowest-quantity) entry per tool+variant with
 *  hard/soft merged. These cost no sulfur — eco/soft-side options.
 *  @param {Array} records The durability records.
 *  @param {function} nameOf Resolve tool id -> name.
 *  @return {Array} The group rows.
 */
function buildMeleeAndTools(records, nameOf) {
    /* tool|variant -> { hard, soft, any } */
    const byTool = new Map();
    for (const record of records) {
        if (record.group !== 'melee') continue;
        if (record.quantity > MAX_PRACTICAL_QUANTITY) continue;
        const key = `${nameOf(record.toolId)}|${record.caption || ''}`;
        if (!byTool.has(key)) byTool.set(key, { hard: null, soft: null, any: null });
        const slot = byTool.get(key);
        const side = record.which === 'hard' ? 'hard' : record.which === 'soft' ? 'soft' : 'any';
        if (!slot[side] || record.quantity < slot[side].quantity) slot[side] = record;
    }

    const rows = [];
    for (const slot of byTool.values()) {
        const ref = slot.soft || slot.any || slot.hard; /* melee shines soft-side */
        if (!ref) continue;
        rows.push(mergeSides(baseRow(ref, nameOf), slot.hard, slot.soft || slot.any));
    }

    rows.sort((a, b) => {
        const qa = a.quantitySoftSide ?? a.quantity ?? Infinity;
        const qb = b.quantitySoftSide ?? b.quantity ?? Infinity;
        return qa - qb;
    });
    return rows.slice(0, MAX_MELEE);
}

/**
 *  Build the grouped destroyOptions object from raw durability records.
 *  @param {Array|undefined} records Durability records for one target.
 *  @param {function} nameOf Resolve numeric item id -> display name.
 *  @return {Object|null} { explosives, gunsAndAmmo, meleeAndTools, note } or null.
 */
function buildDestroyOptions(records, nameOf) {
    if (!Array.isArray(records) || records.length === 0) return null;

    const explosives = buildExplosives(records, nameOf);
    const gunsAndAmmo = buildGunsAndAmmo(records, nameOf);
    const meleeAndTools = buildMeleeAndTools(records, nameOf);

    if (explosives.length === 0 && gunsAndAmmo.length === 0 && meleeAndTools.length === 0) {
        return null;
    }

    const result = { note: NOTE };
    if (explosives.length > 0) result.explosives = explosives;
    if (gunsAndAmmo.length > 0) result.gunsAndAmmo = gunsAndAmmo;
    if (meleeAndTools.length > 0) result.meleeAndTools = meleeAndTools;
    return result;
}

module.exports = { buildDestroyOptions };
