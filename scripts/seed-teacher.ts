import { getPayload } from 'payload'
import config from '../src/payload.config'

async function main(): Promise<void> {
  const email = 'teacher@wellfind.com'
  const password = '427rohit@'

  const payload = await getPayload({ config })

  // Find or create the user
  const existingUsers = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })

  let userId: number
  if (existingUsers.docs.length > 0) {
    userId = existingUsers.docs[0].id as number
    await payload.update({
      collection: 'users',
      id: userId,
      data: { password, role: 'teacher', status: 'active' },
    })
    console.log(`User ${email} updated (id: ${userId}).`)
  } else {
    const created = await payload.create({
      collection: 'users',
      data: { email, password, role: 'teacher', status: 'active' },
    })
    userId = created.id as number
    console.log(`User ${email} created (id: ${userId}).`)
  }

  // Check if teacher profile already exists for this user
  const profiles = await payload.find({
    collection: 'teacher-profiles',
    where: { user: { equals: userId } },
    limit: 1,
  })

  let profileId: number

  if (profiles.docs.length > 0) {
    profileId = profiles.docs[0].id as number
    console.log(`Teacher profile already exists for user ${userId} (profileId: ${profileId}).`)
  } else {
    // 1. Create teacher enquiry first
    const enquiry = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Rohit Sharma',
        mobileNumber: '+91 98765 43210',
        email: email,
        highestQualification: 'M.Sc Mathematics',
        teachingExperience: '5 years',
        primarySubject: 'Mathematics',
        classLevel: 'Class 9 to Class 10',
        teachingLocality: 'Dwarka, Delhi',
        preferredAvailability: 'Weekday evenings',
        agreedToPolicy: true,
        applicationStatus: 'approved',
      },
    })
    console.log(`Created teacher enquiry (id: ${enquiry.id}).`)

    // 2. Create teacher profile linked to enquiry and user
    const profile = await payload.create({
      collection: 'teacher-profiles',
      data: {
        name: 'Rohit Sharma',
        email: email,
        mobile: '+91 98765 43210',
        primarySubject: 'Mathematics',
        qualification: 'M.Sc Mathematics',
        experienceYears: 5,
        classLevels: 'Class 9 to Class 10',
        locality: 'Dwarka, Delhi',
        availability: 'Weekday evenings',
        teacherEnquiry: enquiry.id,
        user: userId,
        approvalStatus: 'approved',
        availabilityStatus: 'free',
      } as any,
    })
    profileId = profile.id as number
    console.log(`Created teacher profile linked to user (profileId: ${profileId}).`)
  }

  // Also check if any allocations exist for this teacher profile; if not, create a sample one
  const existingAllocations = await payload.find({
    collection: 'teacher-allocations',
    where: { teacher: { equals: profileId } },
    limit: 5,
  })

  if (existingAllocations.docs.length === 0) {
    // Find a student record to allocate
    const students = await payload.find({
      collection: 'students',
      limit: 2,
    })

    if (students.docs.length > 0) {
      const student1 = students.docs[0]
      await payload.create({
        collection: 'teacher-allocations',
        data: {
          student: student1.id,
          teacher: profileId,
          subject: 'Mathematics',
          status: 'assigned',
          allocationNotes: 'Demo match for Class 10 Mathematics',
          allocatedAt: new Date().toISOString(),
        } as any,
      })
      console.log(`Created sample allocation for student ${student1.id} -> teacher ${profileId}.`)
    }
  }

  console.log('--- ALL SETUP COMPLETE ---')
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}`)
  console.log(`Teacher Profile ID: ${profileId}`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
