import cds from '@sap/cds';

const LOG = cds.log('drafts');

// a blank draft that nobody touched for this long is considered abandoned
const ABANDONED_AFTER_MS = 10 * 60 * 1000;

/**
 * Deletes abandoned blank drafts (e.g. "Create" clicked, then the browser was closed) so they do
 * not clutter the list reports. Only drafts older than ABANDONED_AFTER_MS are removed - a draft
 * that another user is filling in right now must survive somebody else's list refresh.
 *
 * @param {object} drafts draft entity, e.g. Customers.drafts
 * @param {string} blankCondition CQL condition that identifies a still empty draft
 */
export async function purgeAbandonedDrafts(drafts, blankCondition) {
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();
    try {
        await cds.db.run(DELETE.from(drafts).where(`(${blankCondition}) and createdAt < '${cutoff}'`));
    } catch (e) {
        LOG.debug('draft cleanup skipped:', e.message);
    }
}
