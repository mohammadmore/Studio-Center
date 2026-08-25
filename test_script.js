<script>
// Global Network Error Handler
(function() {
    if (window._fetchIntercepted) return;
    window._fetchIntercepted = true;
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            return await originalFetch.apply(this, args);
        } catch (e) {
            return new Response(JSON.stringify({status: 'error', message: 'Network error'}), {
                status: 200, 
                headers: { 'Content-Type': 'application/json' }
            });
        }
    };
})();
</script>
    <script>
        setTimeout(() => {
            loadColleagues();
            loadLeaves();
        }, 100);

        // واکشی لیست همکاران و رندر کردن در کشویی‌ها
        async function loadColleagues() {
            try {
                const res = await fetch('/api/get_colleagues');
                const data = await res.json();
                
                const userSelect = document.getElementById('leaveUser');
                const subSelect = document.getElementById('substituteUser');
                
                userSelect.innerHTML = '<option value="">-- انتخاب کنید --</option>';
                subSelect.innerHTML = '<option value="">بدون جانشین (تسک‌ها معلق میمانند)</option>';
                
                if (data.users && data.users.length > 0) {
                    data.users.forEach(u => {
                        const opt = `<option value="${u.id}">${u.full_name}</option>`;
                        userSelect.innerHTML += opt;
                        subSelect.innerHTML += opt;
                    });
                }
            } catch(e) {
                console.error("Error loading colleagues:", e);
            }
        }

        // واکشی لیست مرخصی‌ها
        async function loadLeaves() {
            const listEl = document.getElementById('leavesList');
            try {
                const res = await fetch('/api/get_leaves');
                const result = await res.json();
                
                if (result.status === 'success') {
                    renderLeaves(result.data, result.isAdmin);
                } else {
                    listEl.innerHTML = `<div style="text-align: center; color: var(--error-color); padding: 20px;">${result.message || 'خطا در دریافت اطلاعات'}</div>`;
                }
            } catch(e) {
                console.error(e);
                listEl.innerHTML = '<div style="color:red; text-align:center; padding: 20px;">خطا در ارتباط با سرور</div>';
            }
        }

        function renderLeaves(leaves, isAdmin) {
            const listEl = document.getElementById('leavesList');
            if (!leaves || leaves.length === 0) {
                listEl.innerHTML = '<div class="searchable-item" style="text-align: center; color: gray; padding: 30px; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border-color);">هیچ درخواستی یافت نشد.</div>';
                return;
            }

            // مرتب‌سازی از جدیدترین
            leaves.sort((a, b) => b.id - a.id);

            let html = '';
            leaves.forEach(l => {
                let badge = '';
                if (l.status === 'pending') badge = '<span class="status-badge status-pending"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> در حال بررسی</span>';
                else if (l.status === 'approved') badge = '<span class="status-badge status-approved"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> تایید شده</span>';
                else if (l.status === 'rejected') badge = '<span class="status-badge status-rejected"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> رد شده</span>';
                
                let actions = '';
                if (isAdmin) {
                    if (l.status === 'pending') {
                        actions += `
                            <button class="action-btn btn-approve" onclick="updateStatus(${l.id}, 'approved')">تایید</button>
                            <button class="action-btn btn-reject" onclick="updateStatus(${l.id}, 'rejected')">رد درخواست</button>
                        `;
                    }
                    actions += `<button class="action-btn btn-delete" onclick="deleteLeave(${l.id})">حذف</button>`;
                }

                html += `
                    <div class="leave-card">
                        <div class="leave-card-header">
                            <div style="font-weight: bold; font-size: 1.1rem; color: var(--text-dark); display: flex; align-items: center; gap: 6px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> 
                                ${l.user_name}
                            </div>
                            <div>${badge}</div>
                        </div>
                        <div class="leave-card-body">
                            <div>
                                <strong style="display:block; margin-bottom: 5px; color: var(--text-dark);">جانشین:</strong>
                                ${l.substitute_name}
                            </div>
                            <div>
                                <strong style="display:block; margin-bottom: 5px; color: var(--text-dark);">از تاریخ:</strong>
                                <span dir="ltr">${window.toPersianDigits ? window.toPersianDigits(l.start_date) : l.start_date}</span>
                            </div>
                            <div>
                                <strong style="display:block; margin-bottom: 5px; color: var(--text-dark);">تا تاریخ:</strong>
                                <span dir="ltr">${window.toPersianDigits ? window.toPersianDigits(l.end_date) : l.end_date}</span>
                            </div>
                        </div>
                        ${actions ? `<div class="leave-card-footer">${actions}</div>` : ''}
                    </div>
                `;
            });
            listEl.innerHTML = html;
        }

        // ارسال فرم به بک‌اند
        async function submitLeave(e) {
            e.preventDefault();
            const btn = document.getElementById('saveBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'در حال پردازش...';
            btn.disabled = true;

            let sDate = window.toEnglishDigits ? window.toEnglishDigits(document.getElementById('startDate').value) : document.getElementById('startDate').value;
            let eDate = window.toEnglishDigits ? window.toEnglishDigits(document.getElementById('endDate').value) : document.getElementById('endDate').value;
            
            if (sDate && eDate && sDate > eDate) {
                const temp = sDate;
                sDate = eDate;
                eDate = temp;
                document.getElementById('startDate').value = window.toPersianDigits ? window.toPersianDigits(sDate) : sDate;
                document.getElementById('endDate').value = window.toPersianDigits ? window.toPersianDigits(eDate) : eDate;
            }

            const payload = {
                user_id: document.getElementById('leaveUser').value,
                substitute_id: document.getElementById('substituteUser').value,
                start_date: sDate,
                end_date: eDate
            };

            if(payload.user_id === payload.substitute_id && payload.substitute_id !== "") {
                showToast("شخص متقاضی نمی‌تواند جانشین خودش باشد!", "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            try {
                const res = await fetch('/api/save_leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                
                if(result.status === 'success') {
                    showToast(result.message);
                    e.target.reset();
                    loadLeaves(); 
                } else {
                    showToast(result.message, "error");
                }
            } catch(err) {
                showToast('خطا در ارتباط با سرور', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }

        async function updateStatus(id, status) {
            if (!confirm(status === 'approved' ? 'آیا از تایید این مرخصی اطمینان دارید؟ (تسک‌ها منتقل خواهند شد)' : 'آیا از رد این درخواست اطمینان دارید؟')) return;
            
            try {
                const res = await fetch('/api/update_leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    showToast(result.message);
                    loadLeaves();
                } else {
                    showToast(result.message, 'error');
                }
            } catch(e) {
                showToast('خطا در ارتباط با سرور', 'error');
            }
        }

        async function deleteLeave(id) {
            if (!confirm('آیا از حذف این درخواست اطمینان دارید؟ این عمل غیرقابل بازگشت است.')) return;
            
            try {
                const res = await fetch('/api/delete_leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    showToast(result.message);
                    loadLeaves();
                } else {
                    showToast(result.message, 'error');
                }
            } catch(e) {
                showToast('خطا در ارتباط با سرور', 'error');
            }
        }
    </script>
