import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout as AntLayout, Menu, Typography, Tag, Tooltip, Button, Badge, Space, Drawer, Modal, Form, Input, Alert, message } from 'antd'
import { MenuOutlined, LeftOutlined, LockOutlined } from '@ant-design/icons'
import {
  Settings, Users, Bell,
  FlaskConical, LogOut, FlaskConical as Flask, User, Shield, KeyRound,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { system as systemApi, auth as authApi } from '../api/client'

// Self-service "change my password" (old → new), available to any signed-in user.
function ChangePasswordModal({ open, onClose }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  useEffect(() => { if (open) { setError(''); form.resetFields() } }, [open, form])
  const onFinish = async ({ old_password, new_password, confirm }) => {
    if (new_password !== confirm) { setError('The new passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      await authApi.changePassword(old_password, new_password)
      message.success('Password changed')
      onClose()
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not change the password')
    } finally { setLoading(false) }
  }
  return (
    <Modal open={open} onCancel={onClose} footer={null} destroyOnClose
      title={<span className="flex items-center gap-2"><KeyRound size={16} /> Change password</span>}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} disabled={loading}>
        <Form.Item label="Current password" name="old_password" rules={[{ required: true, message: 'Enter the current password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Form.Item label="New password" name="new_password" rules={[{ required: true, message: 'Enter the new password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="Confirm new password" name="confirm" rules={[{ required: true, message: 'Repeat the new password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
          <Button type="primary" htmlType="submit" block loading={loading}>Update password</Button>
        </Form.Item>
      </Form>
    </Modal>
  )
}
import LanguageSelector from './LanguageSelector'
import axios from 'axios'

const { Header, Content } = AntLayout
const { Text, Title } = Typography
const HEALTH_INTERVAL = 15_000

// Titles keyed by the segment after /edit/
const TITLES = {
  editor: 'Editor', users: 'Users', groups: 'Groups',
  alarms: 'Alarms', recipes: 'Recipes',
}

// Edit-mode shell — admin only. Runtime (operator) view renders without this.
export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isOnline, setIsOnline] = useState(null)
  const [simOn, setSimOn] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ver, setVer] = useState(null)   // { app, projectFormat, project }
  const [pwOpen, setPwOpen] = useState(false)  // change-password modal

  const canGoBack = location.key !== 'default'

  const pageTitle = (() => {
    const seg = location.pathname.split('/').filter(Boolean) // e.g. ['edit','editor', ':name']
    const key = seg[0] === 'edit' ? seg[1] : seg[0]
    if (!key) return 'HMI Studio'
    const base = TITLES[key] ?? key
    return seg[2] ? `${base} / ${seg[2]}` : base
  })()

  const checkHealth = useCallback(() => {
    axios.get('/api/health', { timeout: 4000 }).then(() => setIsOnline(true)).catch(() => setIsOnline(false))
  }, [])
  useEffect(() => {
    checkHealth()
    const id = setInterval(checkHealth, HEALTH_INTERVAL)
    return () => clearInterval(id)
  }, [checkHealth])

  useEffect(() => {
    systemApi.getSim().then(d => setSimOn(d.simulation)).catch(() => setSimOn(null))
    systemApi.version().then(setVer).catch(() => setVer(null))
  }, [])
  const toggleSim = () => {
    if (simOn === null) return
    systemApi.setSim(!simOn).then(d => setSimOn(d.simulation)).catch(() => {})
  }

  const ic = (I) => <I size={16} />

  const gestione = [
    { key: '/edit/editor', icon: ic(Settings), label: 'Editor' },
    { key: '/edit/users', icon: ic(Users), label: 'Users' },
    { key: '/edit/groups', icon: ic(Shield), label: 'Groups' },
    { key: '/edit/alarms', icon: ic(Bell), label: 'Alarms' },
    { key: '/edit/recipes', icon: ic(FlaskConical), label: 'Recipes' },
  ]

  const menuItems = [
    { key: 'g-gestione', type: 'group', label: 'MANAGEMENT', children: gestione },
  ]

  // selected key = longest matching route
  const allKeys = gestione.map(i => i.key)
  const selected = allKeys
    .filter(k => location.pathname === k || location.pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0] || '/edit/editor'

  const handleLogout = () => { logout(); navigate('/edit', { replace: true }) }
  const go = (key) => { navigate(key); setDrawerOpen(false) }

  const navDrawer = (
    <Drawer
      placement="left"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      width={270}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      title={<span style={{ fontSize: 16, fontWeight: 600, color: '#1f1f1f' }}>HMI Studio</span>}
    >
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Menu
          mode="inline"
          items={menuItems}
          selectedKeys={[selected]}
          onClick={({ key }) => go(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </div>
      <div style={{ borderTop: '1px solid #eee', padding: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#1f1f1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name || user?.username || '—'}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {user?.capabilities?.manageUsers ? 'Edit mode · User admin' : 'Edit mode'}
            </Text>
          </div>
          <Tooltip title="Log out">
            <Button type="text" icon={<LogOut size={16} />} onClick={handleLogout} />
          </Tooltip>
        </Space>
        <div style={{ marginTop: 8, textAlign: 'center', lineHeight: 1.3 }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
            {`HMI Studio${ver?.app ? ` v${ver.app}` : ''}`}
          </Text>
          {ver?.programVersion && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
              {`Program version: ${ver.programVersion}`}
            </Text>
          )}
        </div>
      </div>
    </Drawer>
  )

  return (
    <AntLayout style={{ height: '100vh', background: '#F3F6F9' }}>
      {/* RTS-style top header bar */}
      <Header
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#F3F6F9', borderBottom: '1px solid #e5e7eb',
          padding: '0 16px', height: 56, lineHeight: 'normal',
        }}
      >
        <Button
          type="text"
          icon={<MenuOutlined style={{ fontSize: 22 }} />}
          onClick={() => setDrawerOpen(true)}
          style={{ height: 44, width: 44 }}
        />
        {canGoBack && (
          <Button
            type="primary"
            icon={<LeftOutlined style={{ fontSize: 22 }} />}
            onClick={() => navigate(-1)}
            style={{ height: 44, width: 44 }}
          />
        )}

        <Title level={4} style={{ margin: 0, color: '#000', flexGrow: 1, textAlign: 'center' }}>
          <strong>{pageTitle}</strong>
        </Title>

        <Space size="middle">
          {user && (
            <Tooltip title={`Signed in — ${user?.username ?? ''}`}>
              <Space size={6} style={{ padding: '2px 8px', borderRadius: 999, background: '#fff', border: '1px solid #e5e7eb' }}>
                <User size={15} color="#1677ff" />
                <div style={{ lineHeight: 1.1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1f1f1f', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.full_name || user?.username || '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#8c8c8c' }}>{user?.capabilities?.manageUsers ? 'User admin' : 'Edit mode'}</div>
                </div>
                <Tooltip title="Change password">
                  <Button type="text" size="small" icon={<KeyRound size={14} />} onClick={() => setPwOpen(true)} />
                </Tooltip>
                <Tooltip title="Log out">
                  <Button type="text" size="small" icon={<LogOut size={14} />} onClick={handleLogout} style={{ marginLeft: 2 }} />
                </Tooltip>
              </Space>
            </Tooltip>
          )}
          <LanguageSelector />
          {simOn !== null && (
            <Tooltip title={simOn ? 'Simulation active — click to connect to the PLC' : 'Connected to the PLC — click to simulate'}>
              <Tag
                icon={<Flask size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                color={simOn ? 'gold' : 'green'}
                onClick={toggleSim}
                style={{ cursor: 'pointer', margin: 0, padding: '2px 10px', borderRadius: 999 }}
              >
                {simOn ? 'SIMULATION' : 'PLC LIVE'}
              </Tag>
            </Tooltip>
          )}
          <Tooltip title={isOnline === null ? 'Backend: sconosciuto' : isOnline ? 'Backend online' : 'Backend offline'}>
            <Space size={6}>
              <Badge status={isOnline === null ? 'default' : isOnline ? 'success' : 'error'} />
              <Text type="secondary" style={{ fontSize: 12 }}>Backend</Text>
            </Space>
          </Tooltip>
          <Text strong style={{ fontSize: 14, color: '#1f1f1f', whiteSpace: 'nowrap' }}>HMI Studio</Text>
        </Space>
      </Header>

      {navDrawer}

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />

      <Content id="app-content" style={{ overflow: 'auto', padding: 0, background: '#F3F6F9' }}>
        {children}
      </Content>
    </AntLayout>
  )
}
