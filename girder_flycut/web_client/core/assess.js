// Decides whether a configuration is complete, and what is wrong with it.
// Pure: it reads nothing but its argument, which is why it was the easiest
// thing in the builder to lift out.
export function assessConfiguration({ stackId, operator, lasers, fields, layers, repeat, wraparound, foilMaterial, template, duplicateStack = false, stackState = null, presetFields = [] }) {
    const requirements = [
        { ok: /^(?:F[0-9]{3,4}|[0-9A-HJKMNP-TV-Z]{5})$/.test(stackId.trim()), text: stackId.trim() ? 'Stack ID must match F###, F####, or five uppercase Crockford Base32 characters.' : 'Enter a Stack ID.', target: '#stackid' },
        { ok: lasers.some((laser) => laser.enabled !== false), text: 'Enable at least one laser parameter entry.', target: lasers.length ? '#laserList [data-key="enabled"]' : '#addLaserBtn' },
        { ok: fields.every((field) => !String(field.value ?? '').trim() || field.name.trim()), text: 'Name each custom field that has a value.', target: `.custom-row:nth-child(${fields.findIndex((field) => String(field.value ?? '').trim() && !field.name.trim()) + 1}) [data-key="name"]` },
        { ok: Boolean(foilMaterial), text: 'Select a foil material.', target: '#foilMaterial' },
        { ok: Boolean(template), text: 'Select a template.', target: '#template' }
    ];
    if (presetFields.some((name) => !fields.some((field) => field.name === name))) requirements.push({ ok: false, text: 'Include all custom fields required by the preset.', target: '#customList' });
    const blockedMessage = { registered: 'This Stack ID is registered and cannot be reused.', generated: 'Delete the generated files before reusing this Stack ID.', restricted: 'This Stack ID belongs to another user and cannot be replaced.' }[stackState];
    if (blockedMessage) requirements.push({ ok: false, text: blockedMessage, target: '#stackid' });
    const warnings = [];
    const warningTargets = [];
    const warn = (message, target) => { warnings.push(message); warningTargets.push(target); };
    if (duplicateStack && !blockedMessage) warn('This Stack ID already has a submitted configuration. Validate replacing the existing submitted configuration.', '#stackid');
    if (!operator.trim()) warn('Operator is empty; your username will be used.', '#operator');
    if (lasers.some((laser) => laser.enabled !== false && laser.isDefault)) warn('Some enabled layers still use default laser parameters.', `#laserList .laser-card:nth-child(${lasers.findIndex((laser) => laser.enabled !== false && laser.isDefault) + 1}) [data-key="power"]`);
    const used = new Set();
    let uncovered = false;
    if (layers !== null) {
        for (let position = 0; position < layers.length; position++) {
            let index = Math.floor(position / Math.max(1, repeat || 1));
            if (wraparound && lasers.length) index %= lasers.length;
            if (index < lasers.length && lasers[index].enabled !== false) used.add(index);
            else uncovered = true;
        }
    }
    if (uncovered) warn('Some template flyers are unspecified; their template laser parameters will be retained.', '#repeatX');
    if (lasers.some((laser, index) => laser.enabled === false || (layers !== null && !used.has(index)))) warn('Some listed laser entries are disabled or unused by the template.', `#laserList .laser-card:nth-child(${lasers.findIndex((laser, index) => laser.enabled === false || (layers !== null && !used.has(index))) + 1}) [data-key="enabled"]`);
    if (fields.some((field) => field.name.trim() && !String(field.value ?? '').trim())) warn('Some custom fields have no value; they will export as null.', `.custom-row:nth-child(${fields.findIndex((field) => field.name.trim() && !String(field.value ?? '').trim()) + 1}) [data-key="value"]`);
    const complete = requirements.every((requirement) => requirement.ok);
    return { requirements, warnings, violations: [...requirements.filter((item) => !item.ok).map((item) => ({ ...item, kind: 'Required' })), ...warnings.map((text, index) => ({ text, target: warningTargets[index], kind: 'Validation' }))], status: !complete ? 'Incomplete' : warnings.length ? 'Needs validation' : 'Complete', complete };
}
