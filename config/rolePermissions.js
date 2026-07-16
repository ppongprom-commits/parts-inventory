/**
 * Role permission matrix — single source of truth
 * ------------------------------------------------------------
 * แก้ไฟล์นี้ไฟล์เดียวเมื่อสิทธิ์ของแต่ละบทบาทเปลี่ยน
 * ตาราง "ตารางสิทธิ์การใช้งานตามบทบาท" ในหน้า /admin/team
 * จะอ่านค่าจากที่นี่โดยตรงและอัปเดตให้อัตโนมัติ ไม่ต้องแก้ 2 ที่
 *
 * หมายเหตุ: object นี้เป็นเอกสารอ้างอิงสำหรับแสดงผล UI เท่านั้น
 * สิทธิ์จริงที่บังคับใช้อยู่ที่ RLS policy ใน db/*.sql — ถ้าแก้ที่นี่
 * ต้องไปแก้ policy ที่เกี่ยวข้องให้ตรงกันด้วย ไม่งั้นตารางจะไม่ตรงกับพฤติกรรมจริง
 */

export const PERMISSION_LABELS = {
  view_parts: "ดูรายการอะไหล่",
  view_price: "เห็นราคาในหน้าหลัก",
  add_edit_parts: "เพิ่ม/แก้ไขอะไหล่",
  delete_parts: "ลบอะไหล่ (hard delete)",
  manage_zones_options: "จัดการโซน/ตัวเลือก (สภาพ/ที่มา/สถานะ)",
  invite_members: "เชิญสมาชิกเข้าอู่",
  change_roles: "เปลี่ยนสิทธิ์/ปิดใช้งานสมาชิก",
};

export const ROLE_PERMISSIONS = {
  owner: {
    view_parts: true,
    view_price: true,
    add_edit_parts: true,
    delete_parts: true,
    manage_zones_options: true,
    invite_members: true,
    change_roles: true,
  },
  manager: {
    view_parts: true,
    view_price: true,
    add_edit_parts: true,
    delete_parts: true,
    manage_zones_options: true,
    invite_members: true,
    change_roles: true,
  },
  supervisor: {
    view_parts: true,
    view_price: true,
    add_edit_parts: true,
    delete_parts: false,
    manage_zones_options: false,
    invite_members: false,
    change_roles: false,
  },
  technician: {
    view_parts: true,
    view_price: false,
    add_edit_parts: true,
    delete_parts: false,
    manage_zones_options: false,
    invite_members: false,
    change_roles: false,
  },
  assistant: {
    view_parts: true,
    view_price: false,
    add_edit_parts: true,
    delete_parts: false,
    manage_zones_options: false,
    invite_members: false,
    change_roles: false,
  },
};
