export function isHelperLine(object) {
    return !!(object && object.isLineSegments && (
        object.userData?.isHelper ||
        object.name === '__helper_edges__' ||
        object.geometry?.type === 'EdgesGeometry'
    ));
}

export function detachHelperLines(root) {
    if (!root || typeof root.traverse !== 'function') return [];
    const removed = [];
    root.traverse(child => {
        if (isHelperLine(child) && child.parent) {
            removed.push({ child, parent: child.parent });
        }
    });
    removed.forEach(({ child, parent }) => parent.remove(child));
    return removed;
}

export function restoreDetachedHelpers(removed) {
    removed.forEach(({ child, parent }) => parent.add(child));
}

export function serializeProjectObjects(objects) {
    return objects.map(obj => {
        const removed = detachHelperLines(obj);
        const hasHelper = obj.userData && Object.prototype.hasOwnProperty.call(obj.userData, 'helper');
        const helperValue = hasHelper ? obj.userData.helper : undefined;
        if (hasHelper) delete obj.userData.helper;

        const json = obj.toJSON();

        if (hasHelper) obj.userData.helper = helperValue;
        restoreDetachedHelpers(removed);
        return json;
    });
}
