/* ── همگام‌سازی مخاطبان دفترچه تلفن با کارکنان ──────────────────────
   هر کارمند با مخاطبش از راه نقطهٔ مشترک (شمارهٔ پرسنلی، کد ملی، تلفن همراه)
   لینک می‌شود. با ایجاد کارمند، مخاطبش هم ساخته می‌شود ولی با حذف کارمند
   مخاطب حذف نمی‌شود. مخاطبی که از این راه ساخته شده تا وقتی اطلاعاتش
   تکمیل/اصلاح نشده «در انتظار تکمیل» است و در دفترچه با رنگ زرد دیده می‌شود. */
(function () {
  'use strict';

  const PHONEBOOK_KEY = 'atlasShiftPhonebookV2';

  function digits(value) {
    return String(value == null ? '' : value)
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\D/g, '');
  }

  function phoneDigits(contact) {
    const out = [];
    (contact.phoneNumbers || []).forEach(phone => {
      const raw = digits((phone.prefix || '') + (phone.value || ''));
      if (raw) out.push(raw);
    });
    return out;
  }

  function normalizeContact(value) {
    const contact = value && typeof value === 'object' ? Object.assign({}, value) : {};
    contact.name = String(contact.name || '');
    contact.phoneNumbers = Array.isArray(contact.phoneNumbers) ? contact.phoneNumbers.map(phone => ({
      kind: phone && phone.kind === 'office' ? 'office' : 'mobile',
      label: String((phone && phone.label) || (phone && phone.kind === 'office' ? 'تلفن دفتر' : 'تلفن همراه')),
      prefix: String((phone && phone.prefix) || ''),
      value: String((phone && (phone.value || phone.number)) || ''),
      secretary: String((phone && phone.secretary) || '')
    })) : [];
    ['extension', 'area', 'city', 'complex', 'transferCenter', 'station', 'building', 'unit', 'position', 'supervision',
      'personnelId', 'nationalId', 'sourceEmployeeId', 'origin'].forEach(key => {
      contact[key] = String(contact[key] == null ? '' : contact[key]);
    });
    contact.pending = !!contact.pending;
    if (!Array.isArray(contact.numbers)) contact.numbers = [];
    return contact;
  }

  function loadContacts() {
    try {
      const raw = localStorage.getItem(PHONEBOOK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizeContact) : [];
    } catch (error) {
      return [];
    }
  }

  function saveContacts(contacts) {
    try {
      localStorage.setItem(PHONEBOOK_KEY, JSON.stringify(contacts));
      document.dispatchEvent(new CustomEvent('atlas-contacts-changed'));
      return true;
    } catch (error) {
      return false;
    }
  }

  function employeeKeys(employee) {
    if (!employee) return {};
    const mobile = digits(employee.mobile);
    return {
      personnelId: String(employee.personnelId || '').trim(),
      nationalId: String(employee.nationalId || '').trim(),
      mobiles: mobile ? [mobile, mobile.replace(/^0+/, '')] : []
    };
  }

  function isSameEmployee(contact, employee) {
    if (!contact || !employee) return false;
    const keys = employeeKeys(employee);
    if (contact.sourceEmployeeId && String(contact.sourceEmployeeId) === String(employee.id)) return true;
    const contactPersonnel = String(contact.personnelId || '').trim();
    if (keys.personnelId && contactPersonnel && contactPersonnel === keys.personnelId) return true;
    const contactNational = String(contact.nationalId || '').trim();
    if (keys.nationalId && contactNational && contactNational === keys.nationalId) return true;
    if (keys.mobiles.length) {
      const contactPhones = phoneDigits(contact);
      return contactPhones.some(phone => keys.mobiles.some(mobile => mobile && (phone === mobile || phone.endsWith(mobile) || mobile.endsWith(phone))));
    }
    return false;
  }

  function fullName(employee) {
    const joined = [employee.firstName, employee.lastName].map(part => String(part == null ? '' : part).trim()).filter(Boolean).join(' ');
    return joined || String(employee.fullName || '').trim();
  }

  function fillEmpty(contact, key, value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return false;
    if (String(contact[key] || '').trim()) return false;
    contact[key] = text;
    return true;
  }

  // مخاطب کارمند را می‌سازد یا با او همگام می‌کند. حذف کارمند هیچ اثری روی مخاطب ندارد.
  function syncEmployee(employee) {
    if (!employee || !employee.id) return null;
    const contacts = loadContacts();
    let contact = contacts.filter(item => isSameEmployee(item, employee))[0];
    let created = false;
    if (!contact) {
      contact = normalizeContact({
        name: fullName(employee),
        personnelId: employee.personnelId,
        nationalId: employee.nationalId,
        position: employee.jobTitle,
        city: employee.workplace,
        unit: employee.unit,
        phoneNumbers: [],
        origin: 'employee',
        sourceEmployeeId: String(employee.id),
        pending: true
      });
      const mobile = String(employee.mobile || '').trim();
      if (mobile) contact.phoneNumbers.push({ kind: 'mobile', label: 'تلفن همراه', prefix: '', value: mobile, secretary: '' });
      contacts.push(contact);
      created = true;
    } else {
      let changed = false;
      if (!contact.sourceEmployeeId) { contact.sourceEmployeeId = String(employee.id); changed = true; }
      if (!contact.personnelId && employee.personnelId) { contact.personnelId = String(employee.personnelId); changed = true; }
      if (!contact.nationalId && employee.nationalId) { contact.nationalId = String(employee.nationalId); changed = true; }
      // فقط جاهای خالی پر می‌شوند؛ نوشتهٔ کاربر بازنویسی نمی‌شود.
      if (fillEmpty(contact, 'name', fullName(employee))) changed = true;
      if (fillEmpty(contact, 'position', employee.jobTitle)) changed = true;
      if (fillEmpty(contact, 'city', employee.workplace)) changed = true;
      // پیش از این «واحد» مخاطب با «شهر» کارمند پر می‌شد؛ همان مقدار غلط اصلاح می‌شود.
      if (String(employee.unit || '').trim() && String(contact.unit || '').trim() === String(employee.workplace || '').trim()) {
        contact.unit = String(employee.unit).trim();
        changed = true;
      } else if (fillEmpty(contact, 'unit', employee.unit)) changed = true;
      if (!contact.phoneNumbers.length && String(employee.mobile || '').trim()) {
        contact.phoneNumbers.push({ kind: 'mobile', label: 'تلفن همراه', prefix: '', value: String(employee.mobile).trim(), secretary: '' });
        changed = true;
      }
      if (!changed) {
        // مخاطبی که خودِ برنامه از کارمند ساخته، شمارهٔ همراه تازه را هم دنبال می‌کند؛
        // مخاطبی که کاربر خودش نوشته دست‌نخورده می‌ماند.
        const mobile = String(employee.mobile || '').trim();
        const autoMobile = contact.pending ? (contact.phoneNumbers || []).find(phone => phone.kind !== 'office') : null;
        if (mobile && autoMobile && String(autoMobile.value || '').trim() !== mobile) {
          autoMobile.value = mobile;
          changed = true;
        }
      }
      if (!changed) return contact;
    }
    saveContacts(contacts);
    return { contact: contact, created: created };
  }

  // وقتی کاربر مخاطب را خودش ویرایش و تکمیل کرد، رنگ زرد «در انتظار تکمیل» برداشته می‌شود.
  function markContactCompleted(contact) {
    if (!contact || !contact.pending) return contact;
    contact.pending = false;
    return contact;
  }

  document.addEventListener('atlas-record-saved', event => {
    // همگام‌سازی مخاطب نباید ثبتِ موفق کارمند را با پیام خطای نادرست خراب کند؛
    // اگر ذخیره‌سازی مخاطب موقتاً نشد، خودِ ثبت کارمند از قبل انجام شده است.
    try {
      const detail = event.detail || {};
      if (detail.module !== 'employees' || !detail.record) return;
      syncEmployee(detail.record);
    } catch (error) {}
  });

  window.AtlasContactSync = {
    loadContacts: loadContacts,
    saveContacts: saveContacts,
    syncEmployee: syncEmployee,
    isSameEmployee: isSameEmployee,
    markContactCompleted: markContactCompleted,
    normalizeContact: normalizeContact
  };
})();
