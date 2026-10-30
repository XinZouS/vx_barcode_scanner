// pages/enterprise-picker/enterprise-picker.js
// 选择 / 新增 生产企业（对齐 Vue components/EnterpriseSearchDialog.vue）
const request = require('../../utils/request')
const userManager = require('../../utils/user')

// 与后端 enterprise/models.py EnterpriseType 一致
const ENTERPRISE_TYPE_OPTIONS = [
  { value: 0, label: '生产商' },
  { value: 1, label: '批发商' },
  { value: 2, label: '零售商' }
]

const EMPTY_FORM = {
  name: '',
  shortname: '',
  enterprisetype: 0,
  category: null,
  address: '',
  phone: '',
  note: ''
}

Page({
  data: {
    searchKey: '',
    list: [],
    total: 0,
    page: 1,
    size: 20,
    loading: false,
    hasMore: false,

    // 新增企业
    showCreate: false,
    saving: false,
    form: { ...EMPTY_FORM },
    labels: { enterprisetype: '生产商', category: '' },
    categories: [],

    // 底部选择弹层
    showSelect: false,
    selectField: '',
    selectTitle: '',
    selectOptions: [],
    selectCurrent: ''
  },

  onLoad() {
    this.fetchList(1)
    this.fetchCategories()
  },

  // ========== 企业列表 ==========
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  clearSearch() {
    this.setData({ searchKey: '' })
    this.fetchList(1)
  },

  async fetchList(page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const params = { page: page || 1, size: this.data.size }
    const key = (this.data.searchKey || '').trim()
    if (key) params.search_key = key

    try {
      const data = await request.get('/enterprise/', params)
      const list = (data && data.results) || []
      const total = (data && data.count) || 0
      const merged = page > 1 ? this.data.list.concat(list) : list

      this.setData({
        list: merged,
        total,
        page: page || 1,
        hasMore: merged.length < total,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: (err && err.message) || '查询失败', icon: 'none' })
    }
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.fetchList(this.data.page + 1)
  },

  doSearch() {
    this.fetchList(1)
  },

  // ========== 选中企业 ==========
  onSelectRow(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    this._emitSelected({ id: item.id, name: item.name })
  },

  _emitSelected(payload) {
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (channel && channel.emit) {
      channel.emit('enterpriseSelected', payload)
    }
    wx.navigateBack()
  },

  // ========== 新增企业 ==========
  async fetchCategories() {
    try {
      const data = await request.get('/enterprise/business/category/', { size: 200 })
      const list = (data && data.results) || data || []
      this.setData({
        categories: list.map(it => ({ value: it.id, label: it.name }))
      })
    } catch (err) {
      // 业务分类不是必填，拉取失败不阻塞
    }
  },

  toggleCreate() {
    this.setData({
      showCreate: !this.data.showCreate,
      form: { ...EMPTY_FORM },
      labels: { enterprisetype: '生产商', category: '' }
    })
  },

  closeCreate() {
    this.setData({ showCreate: false })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  openSelect(e) {
    const field = e.currentTarget.dataset.field
    const isType = field === 'enterprisetype'
    const rawOptions = isType ? ENTERPRISE_TYPE_OPTIONS : this.data.categories
    const current = this.data.form[field]

    this.setData({
      showSelect: true,
      selectField: field,
      selectTitle: isType ? '单位类别' : '业务分类',
      selectOptions: rawOptions.map(o => ({
        value: o.value === null || o.value === undefined ? '' : String(o.value),
        label: o.label
      })),
      selectCurrent: current === null || current === undefined || current === '' ? '' : String(current)
    })
  },

  closeSelect() {
    this.setData({ showSelect: false })
  },

  onSelectOption(e) {
    const field = this.data.selectField
    const raw = e.currentTarget.dataset.value
    const label = e.currentTarget.dataset.label
    const val = raw === '' || raw === null || raw === undefined ? null : Number(raw)

    this.setData({
      showSelect: false,
      [`form.${field}`]: val,
      [`labels.${field}`]: val === null ? '' : label
    })
  },

  preventBubble() {},

  async submitCreate() {
    const { form, saving } = this.data
    if (saving) return

    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请输入企业单位名称', icon: 'none' })
      return
    }

    const user = userManager.getUserInfo() || {}
    const userId = user.id || user.user_id
    if (!userId) {
      wx.showToast({ title: '用户信息异常，请重新登录', icon: 'none' })
      return
    }

    const trimOrNull = (v) => {
      const s = (v || '').trim()
      return s === '' ? null : s
    }

    const payload = {
      name: form.name.trim(),
      shortname: trimOrNull(form.shortname),
      enterprisetype: form.enterprisetype === null ? 0 : form.enterprisetype,
      category: form.category || null,
      address: trimOrNull(form.address),
      phone: trimOrNull(form.phone),
      note: trimOrNull(form.note),
      updateuser: String(userId)
    }

    this.setData({ saving: true })
    try {
      const created = await request.post('/enterprise/', payload)
      const id = created && created.id
      if (!id) {
        throw { message: '新增成功但未返回企业 ID，请返回后重新搜索' }
      }
      wx.showToast({ title: '企业已新增', icon: 'success' })
      setTimeout(() => {
        this._emitSelected({ id, name: form.name.trim() })
      }, 500)
    } catch (err) {
      wx.showModal({
        title: '❌ 新增失败',
        content: (err && err.message) || '操作失败',
        showCancel: false,
        confirmText: '我知道了'
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})
