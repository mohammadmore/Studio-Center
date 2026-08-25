
// Get user's batch operations
apiRouter.get('/get_batch_operations.php', (req: any, res: any) => {
    const username = (req.session && req.session.user && req.session.user.username) ? req.session.user.username : 'admin';
    // Show only operations from this user
    const userOps = batch_operations.filter(op => op.user === username);
    res.json({ status: 'success', data: userOps });
});

apiRouter.post('/undo_batch_operation.php', (req: any, res: any) => {
    const username = (req.session && req.session.user && req.session.user.username) ? req.session.user.username : 'admin';
    const { batch_id } = req.body;
    
    const operation = batch_operations.find(op => op.id === batch_id);
    if (!operation) {
        return res.status(404).json({ status: 'error', message: 'عملیات یافت نشد' });
    }
    
    if (operation.user !== username) {
        return res.status(403).json({ status: 'error', message: 'شما مجاز به لغو این عملیات نیستید' });
    }
    
    if (operation.is_undone) {
        return res.status(400).json({ status: 'error', message: 'این عملیات قبلاً لغو شده است' });
    }
    
    try {
        if (operation.type === 'bulk_import') {
            // Delete imported items and put them in recycle bin
            for (const itemId of operation.item_ids) {
                const idx = contents.findIndex(c => c.id === itemId);
                if (idx !== -1) {
                    const itemToDelete = contents[idx];
                    const binId = Date.now() + Math.floor(Math.random() * 1000);
                    recycle_bin.unshift({
                        id: binId,
                        table: 'contents',
                        item_title: itemToDelete.title || 'محتوای وارد شده',
                        data: itemToDelete,
                        deleted_at: new Date().toISOString(),
                        deleted_by: username
                    });
                    contents.splice(idx, 1);
                }
            }
        } else if (operation.type === 'batch_delete') {
            // Restore from recycle bin
            for (const binId of operation.deleted_bin_ids || []) {
                const binIdx = recycle_bin.findIndex(b => b.id === binId);
                if (binIdx !== -1) {
                    const binItem = recycle_bin[binIdx];
                    contents.push(binItem.data);
                    recycle_bin.splice(binIdx, 1);
                }
            }
        } else if (operation.type === 'batch_edit') {
            // Restore previous states
            for (const prevState of operation.previous_states || []) {
                const idx = contents.findIndex(c => c.id === prevState.id);
                if (idx !== -1) {
                    contents[idx] = prevState;
                }
            }
        }
        
        operation.is_undone = true;
        saveDatabase();
        res.json({ status: 'success', message: 'عملیات با موفقیت لغو شد' });
    } catch (e: any) {
        console.error('Error undoing batch operation', e);
        res.status(500).json({ status: 'error', message: 'خطا در لغو عملیات' });
    }
});
