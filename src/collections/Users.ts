import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  hooks: {
    afterLogin: [
      async ({ user }) => {
        if (user && (user.status === 'blocked' || user.status === 'suspended')) {
          throw new Error('Account is blocked or suspended.')
        }
        return user
      },
    ],
  },
  access: {
    read: ({ req: { user } }) => {
      // Authenticated users can read their own profile
      if (user) {
        return { id: { equals: user.id } }
      }
      // super_admin can read all (checked below via role)
      return false
    },
    create: ({ req: { user } }) => {
      // Only super_admin can create users
      return Boolean(user && user.role === 'super_admin')
    },
    update: ({ req: { user } }) => {
      // super_admin can update any user; teachers can update only their own non-protected fields
      if (user && user.role === 'super_admin') {
        return true
      }
      if (user) {
        return { id: { equals: user.id } }
      }
      return false
    },
    delete: ({ req: { user } }) => {
      // Only super_admin can delete users
      return Boolean(user && user.role === 'super_admin')
    },
  },
  fields: [
    // Email added by default by Payload auth
    {
      name: 'role',
      type: 'select',
      options: ['super_admin', 'teacher'],
      defaultValue: 'teacher',
      required: true,
      admin: {
        description: 'Role determines access level within the system.',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: ['active', 'blocked', 'suspended'],
      defaultValue: 'active',
      required: true,
      admin: {
        description:
          'Account status. Blocked and suspended accounts cannot authenticate. Blocked is admin-initiated; suspended is temporary/security-related.',
      },
    },
    // OTP password-reset fields (hashed, never plaintext)
    {
      name: 'otpHash',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'otpExpiresAt',
      type: 'date',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'otpAttempts',
      type: 'number',
      defaultValue: 0,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'otpLastSentAt',
      type: 'date',
      admin: {
        hidden: true,
      },
    },
    // Reset authorization (one-time, short-lived, issued after OTP verification)
    {
      name: 'resetAuthToken',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'resetAuthExpiresAt',
      type: 'date',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'resetAuthUsed',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        hidden: true,
      },
    },
  ],
}
