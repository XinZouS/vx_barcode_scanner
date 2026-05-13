/**
 * 本地缓存工具类
 * 管理任务数据的增删改查
 */

const TASK_LIST_KEY = 'taskList'

/**
 * 获取所有任务列表
 * @returns {Array} 任务列表
 */
const getTaskList = () => {
  try {
    const taskList = wx.getStorageSync(TASK_LIST_KEY)
    return taskList || []
  } catch (e) {
    console.error('获取任务列表失败:', e)
    return []
  }
}

/**
 * 保存任务列表
 * @param {Array} taskList 任务列表
 */
const saveTaskList = (taskList) => {
  try {
    wx.setStorageSync(TASK_LIST_KEY, taskList)
    return true
  } catch (e) {
    console.error('保存任务列表失败:', e)
    return false
  }
}

/**
 * 创建新任务
 * @param {string} name 任务名称（可选，默认使用开始时间）
 * @returns {Object} 新创建的任务对象
 */
const createTask = (name = '') => {
  const now = new Date()
  const startTime = formatDate(now)
  const taskName = name || startTime
  
  const newTask = {
    id: generateId(),
    name: taskName,
    startTime: now.getTime(),
    startTimeStr: startTime,
    data: {},  // {code: count} 格式
    totalCount: 0,
    updateTime: now.getTime()
  }
  
  const taskList = getTaskList()
  taskList.unshift(newTask)  // 新任务添加到开头
  saveTaskList(taskList)
  
  return newTask
}

/**
 * 更新任务名称
 * @param {string} taskId 任务ID
 * @param {string} newName 新名称
 * @returns {boolean} 是否成功
 */
const updateTaskName = (taskId, newName) => {
  const taskList = getTaskList()
  const index = taskList.findIndex(task => task.id === taskId)
  
  if (index === -1) {
    console.error('任务不存在:', taskId)
    return false
  }
  
  taskList[index].name = newName
  taskList[index].updateTime = new Date().getTime()
  
  return saveTaskList(taskList)
}

/**
 * 更新任务数据（扫码后调用）
 * @param {string} taskId 任务ID
 * @param {string} code 条码
 * @param {number} count 数量
 * @returns {boolean} 是否成功
 */
const updateTaskData = (taskId, code, count) => {
  const taskList = getTaskList()
  const index = taskList.findIndex(task => task.id === taskId)
  
  if (index === -1) {
    console.error('任务不存在:', taskId)
    return false
  }
  
  const task = taskList[index]
  
  // 如果code已存在，累加count；否则新增
  if (task.data[code]) {
    task.data[code] += count
  } else {
    task.data[code] = count
  }
  
  // 更新总数量
  task.totalCount = Object.values(task.data).reduce((sum, val) => sum + val, 0)
  task.updateTime = new Date().getTime()
  
  return saveTaskList(taskList)
}

/**
 * 获取任务详情
 * @param {string} taskId 任务ID
 * @returns {Object|null} 任务对象
 */
const getTaskById = (taskId) => {
  const taskList = getTaskList()
  return taskList.find(task => task.id === taskId) || null
}

/**
 * 删除任务
 * @param {string} taskId 任务ID
 * @returns {boolean} 是否成功
 */
const deleteTask = (taskId) => {
  const taskList = getTaskList()
  const newTaskList = taskList.filter(task => task.id !== taskId)
  
  if (newTaskList.length === taskList.length) {
    console.error('任务不存在:', taskId)
    return false
  }
  
  return saveTaskList(newTaskList)
}

/**
 * 清空所有任务
 * @returns {boolean} 是否成功
 */
const clearAllTasks = () => {
  try {
    wx.removeStorageSync(TASK_LIST_KEY)
    return true
  } catch (e) {
    console.error('清空任务失败:', e)
    return false
  }
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
const generateId = () => {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

/**
 * 格式化日期
 * @param {Date} date 日期对象
 * @returns {string} 格式化后的日期字符串
 */
const formatDate = (date) => {
  const year = date.getFullYear()
  const month = padZero(date.getMonth() + 1)
  const day = padZero(date.getDate())
  const hour = padZero(date.getHours())
  const minute = padZero(date.getMinutes())
  const second = padZero(date.getSeconds())
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 补零
 * @param {number} num 数字
 * @returns {string} 补零后的字符串
 */
const padZero = (num) => {
  return num < 10 ? '0' + num : '' + num
}

/**
 * 获取任务数据的数组格式（用于表格展示）
 * @param {Object} data {code: count} 格式的数据
 * @returns {Array} [{code, count}] 格式的数组
 */
const getDataArray = (data) => {
  return Object.keys(data).map(code => ({
    code: code,
    count: data[code]
  }))
}

/**
 * 更新某条数据的数量
 * @param {string} taskId 任务ID
 * @param {string} code 条码
 * @param {number} count 新数量
 * @returns {boolean} 是否成功
 */
const updateTaskItemCount = (taskId, code, count) => {
  const taskList = getTaskList()
  const index = taskList.findIndex(task => task.id === taskId)

  if (index === -1) {
    console.error('任务不存在:', taskId)
    return false
  }

  const task = taskList[index]

  if (!task.data[code]) {
    console.error('条码不存在:', code)
    return false
  }

  task.data[code] = count
  task.totalCount = Object.values(task.data).reduce((sum, val) => sum + val, 0)
  task.updateTime = new Date().getTime()

  return saveTaskList(taskList)
}

/**
 * 删除某条数据
 * @param {string} taskId 任务ID
 * @param {string} code 条码
 * @returns {boolean} 是否成功
 */
const deleteTaskItem = (taskId, code) => {
  const taskList = getTaskList()
  const index = taskList.findIndex(task => task.id === taskId)

  if (index === -1) {
    console.error('任务不存在:', taskId)
    return false
  }

  const task = taskList[index]

  if (!task.data[code]) {
    console.error('条码不存在:', code)
    return false
  }

  delete task.data[code]
  task.totalCount = Object.values(task.data).reduce((sum, val) => sum + val, 0)
  task.updateTime = new Date().getTime()

  return saveTaskList(taskList)
}

module.exports = {
  getTaskList,
  saveTaskList,
  createTask,
  updateTaskName,
  updateTaskData,
  getTaskById,
  deleteTask,
  clearAllTasks,
  getDataArray,
  updateTaskItemCount,
  deleteTaskItem
}
