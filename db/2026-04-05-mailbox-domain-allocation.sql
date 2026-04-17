CREATE TABLE IF NOT EXISTS mailbox_domain_allocation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mailbox_domain TEXT UNIQUE NOT NULL,
    unique_label TEXT NOT NULL,
    managed_prefix TEXT NOT NULL,
    root_domain TEXT NOT NULL,
    base_domain TEXT NOT NULL,
    domain_depth_mode TEXT NOT NULL DEFAULT 'managed_v4',
    reserved_extra_label TEXT,
    source_meta TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mailbox_domain_allocation_base_domain
    ON mailbox_domain_allocation(base_domain);

CREATE INDEX IF NOT EXISTS idx_mailbox_domain_allocation_root_domain
    ON mailbox_domain_allocation(root_domain);

CREATE INDEX IF NOT EXISTS idx_mailbox_domain_allocation_managed_prefix
    ON mailbox_domain_allocation(managed_prefix);
