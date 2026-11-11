import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Alert, Typography, Modal, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { Cpu } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text } = Typography

// Forced change-password step shown when an operator logs in with an expired
// password. Until the password is changed no session is established, so edit
// mode stays out of reach. `creds` carries the username, the just-typed (old)
// password and the temp token returned by the login call.
function ForcePasswordChangeModal({ open, creds, onCancel, onChanged }) {
  const { changePasswordWithToken } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const onFinish = async ({ new_password, confirm }) => {
    if (new_password !== confirm) { setError('The new passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      await changePasswordWithToken(creds.token, creds.password, new_password)
      message.success('Password changed — signing in')
      form.resetFields()
      onChanged(new_password)
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Could not change the password. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Your password has expired"
      onCancel={onCancel}
      footer={null}
      maskClosable={false}
      destroyOnClose
    >
      <Text type="secondary">
        Your password has expired and must be changed before you can continue.
      </Text>
      {error && <Alert type="error" showIcon message={error} style={{ margin: '12px 0' }} />}
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} disabled={loading} style={{ marginTop: 12 }}>
        <Form.Item label="New password" name="new_password" rules={[{ required: true, message: 'Enter the new password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" autoFocus />
        </Form.Item>
        <Form.Item label="Confirm new password" name="confirm" rules={[{ required: true, message: 'Confirm the new password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
          <Button type="primary" htmlType="submit" block loading={loading}>Change password & sign in</Button>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default function LoginPage() {
  const { login, logout } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Pending forced password change: { username, password, token } or null.
  const [expired, setExpired] = useState(null)

  // Establish the session for a successfully-authenticated user and enter the
  // editor, or refuse if the group lacks edit-mode access.
  const enter = (u) => {
    if (!u?.capabilities?.editMode) {
      // Edit mode requires the editMode capability — drop the session and refuse.
      logout()
      setError('Your group does not have edit-mode access.')
      return
    }
    navigate('/edit/editor', { replace: true })
  }

  const onFinish = async ({ username, password }) => {
    setError('')
    setLoading(true)
    try {
      const uname = username.trim()
      const res = await login(uname, password)
      if (res.mustChangePassword) {
        // No session yet — force a password change before granting access.
        setExpired({ username: uname, password, token: res.token })
        return
      }
      enter(res.user)
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Invalid credentials. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  // After a forced change succeeds, log in again with the new password — this
  // time it is not expired, so the session is established normally.
  const onPasswordChanged = async (newPassword) => {
    try {
      const res = await login(expired.username, newPassword)
      setExpired(null)
      enter(res.user)
    } catch (err) {
      setExpired(null)
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Password changed, but sign-in failed. Please log in again.'
      )
    }
  }

  return (
    <div
      id="app-content"
      className="flex min-h-screen items-center justify-center px-4 bg-[#F3F6F9]"
      style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 35%, rgba(22,119,255,0.08) 0%, #F3F6F9 70%)' }}
    >
      <div className="w-full" style={{ maxWidth: 380 }}>
        <Card variant="borderless" styles={{ body: { padding: 28 } }} style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.10)' }}>
          <div className="flex flex-col items-center gap-3" style={{ marginBottom: 20 }}>
            <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: '#1677ff' }}>
              <Cpu size={26} color="#fff" />
            </div>
            <div className="text-center">
              <Title level={4} style={{ margin: 0 }}>HMI Studio</Title>
              <Text type="secondary">Edit mode · Administrator access</Text>
            </div>
          </div>

          {error && (
            <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
          )}

          <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large" disabled={loading}>
            <Form.Item label="User" name="username" rules={[{ required: true, message: 'Enter the username' }]}>
              <Input prefix={<UserOutlined />} placeholder="e.g. admin" autoFocus autoComplete="username" />
            </Form.Item>
            <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Enter the password' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="••••••••" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button type="primary" htmlType="submit" block loading={loading}>Log in</Button>
            </Form.Item>
          </Form>
        </Card>

        <p className="mt-6 text-center" style={{ fontSize: 12, color: '#4b5563' }}>
          HMI Studio · Industrial Supervision System
        </p>
      </div>

      <ForcePasswordChangeModal
        open={!!expired}
        creds={expired || {}}
        onCancel={() => { setExpired(null); setLoading(false) }}
        onChanged={onPasswordChanged}
      />
    </div>
  )
}
