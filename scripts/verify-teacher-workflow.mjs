import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

async function runVerification() {
  console.log('--- Starting Verification of Teacher Approval Workflow ---')
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  let newAppId, reviewAppId, rejectedAppId, approvedAppId
  let profileId

  try {
    // 1. Create a new application
    const newApp = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Test Candidate One (New)',
        mobileNumber: '+91 98888 11111',
        primarySubject: 'English',
        highestQualification: 'M.A. English',
        teachingExperience: '2 years',
        classLevel: 'Class 8',
        teachingLocality: 'Ballygunge, Kolkata',
        preferredAvailability: 'Afternoons',
        agreedToPolicy: true,
      },
    })
    newAppId = newApp.id
    console.log('✓ Scenario 1a: Created new application #' + newAppId)

    // Check it appears in active inquiries (not_equals approved)
    const inqNew = await payload.find({
      collection: 'teacher-enquiries',
      where: { applicationStatus: { not_equals: 'approved' }, id: { equals: newAppId } },
    })
    if (inqNew.docs.length !== 1) throw new Error('New application not found in active inquiries')

    // Check it does NOT appear in teachers
    const tchNew = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: newAppId } },
    })
    if (tchNew.docs.length !== 0) throw new Error('New application should NOT appear in teachers')
    console.log('✓ Scenario 1: New application appears in Teacher Inquiries but NOT in Teachers.')

    // 2. Application under review
    const reviewApp = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Test Candidate Two (Under Review)',
        mobileNumber: '+91 98888 22222',
        primarySubject: 'Chemistry',
        highestQualification: 'M.Sc. Chemistry',
        teachingExperience: '4 years',
        classLevel: 'Class 10',
        teachingLocality: 'Howrah, Kolkata',
        preferredAvailability: 'Mornings',
        agreedToPolicy: true,
      },
    })
    reviewAppId = reviewApp.id
    await payload.update({
      collection: 'teacher-enquiries',
      id: reviewAppId,
      data: { applicationStatus: 'under_review' },
    })

    const inqReview = await payload.find({
      collection: 'teacher-enquiries',
      where: { applicationStatus: { not_equals: 'approved' }, id: { equals: reviewAppId } },
    })
    if (inqReview.docs.length !== 1) throw new Error('Under review application not found in active inquiries')

    const tchReview = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: reviewAppId } },
    })
    if (tchReview.docs.length !== 0) throw new Error('Under review application should NOT appear in teachers')
    console.log('✓ Scenario 2: Under review application appears in Teacher Inquiries but NOT in Teachers.')

    // 3 & 4. Approving an application
    const approvedApp = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Dr. Alok Sen (To Be Approved)',
        mobileNumber: '+91 98888 33333',
        email: 'alok.sen@example.com',
        primarySubject: 'Biology',
        highestQualification: 'Ph.D. Botany',
        teachingExperience: '5 years',
        classLevel: 'Classes 9-10',
        teachingLocality: 'Garia, Kolkata',
        preferredAvailability: 'Flexible',
        agreedToPolicy: true,
      },
    })
    approvedAppId = approvedApp.id

    // Advance to shortlisted and approve
    await payload.update({
      collection: 'teacher-enquiries',
      id: approvedAppId,
      data: { applicationStatus: 'under_review' },
    })
    await payload.update({
      collection: 'teacher-enquiries',
      id: approvedAppId,
      data: { applicationStatus: 'shortlisted' },
    })
    const approvedDoc = await payload.update({
      collection: 'teacher-enquiries',
      id: approvedAppId,
      data: {
        applicationStatus: 'approved',
        reviewedAt: new Date().toISOString(),
      },
    })
    console.log('✓ Scenario 3a: Successfully approved application #' + approvedAppId)

    // Check it is EXCLUDED from active inquiries
    const inqApproved = await payload.find({
      collection: 'teacher-enquiries',
      where: { applicationStatus: { not_equals: 'approved' }, id: { equals: approvedAppId } },
    })
    if (inqApproved.docs.length !== 0) throw new Error('Approved application should NOT be in active inquiries')
    console.log('✓ Scenario 3: Approving application removes it from active Teacher Inquiries.')

    // Check corresponding teacher profile appears in Teachers
    const tchApproved = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: approvedAppId } },
    })
    if (tchApproved.docs.length !== 1) throw new Error('Approved application must have 1 teacher profile')
    const createdProfile = tchApproved.docs[0]
    profileId = createdProfile.id
    if (createdProfile.name !== 'Dr. Alok Sen (To Be Approved)') throw new Error('Name did not carry over')
    if (createdProfile.primarySubject !== 'Biology') throw new Error('Subject did not carry over')
    if (createdProfile.experienceYears !== 5) throw new Error('Experience years did not carry over')
    if (createdProfile.approvalStatus !== 'approved') throw new Error('Profile status must be approved')
    console.log('✓ Scenario 4: Corresponding teacher profile #' + profileId + ' appears in Teachers with correct details.')

    // 5. Refreshing both preserves correct separation
    const refreshInquiries = await payload.find({
      collection: 'teacher-enquiries',
      where: { applicationStatus: { not_equals: 'approved' } },
    })
    const hasApprovedInInquiries = refreshInquiries.docs.some((d) => d.id === approvedAppId)
    if (hasApprovedInInquiries) throw new Error('Approved enquiry leaked into refreshed inquiries')

    const refreshTeachers = await payload.find({
      collection: 'teacher-profiles',
      where: { approvalStatus: { equals: 'approved' } },
    })
    const hasProfileInTeachers = refreshTeachers.docs.some((d) => d.id === profileId)
    if (!hasProfileInTeachers) throw new Error('Teacher profile missing from refreshed teachers')
    console.log('✓ Scenario 5: Refreshing both lists preserves strict separation.')

    // 6. Idempotency: Repeating approval does not create duplicate teacher profiles
    await payload.update({
      collection: 'teacher-enquiries',
      id: approvedAppId,
      data: {
        applicationStatus: 'approved',
        adminNotes: 'Repeated approval test',
      },
    })
    const profilesAfterRepeat = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: approvedAppId } },
    })
    if (profilesAfterRepeat.docs.length !== 1) throw new Error('Repeating approval created duplicate profiles!')
    console.log('✓ Scenario 6: Repeating approval request does NOT create duplicate teacher profiles (Idempotent).')

    // 7. Rejected applications remain in Teacher Inquiries
    const rejectedApp = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Test Candidate Four (Rejected)',
        mobileNumber: '+91 98888 44444',
        primarySubject: 'History',
        highestQualification: 'B.A.',
        teachingExperience: 'Fresher',
        classLevel: 'Class 6',
        teachingLocality: 'Kolkata',
        preferredAvailability: 'Weekends',
        agreedToPolicy: true,
      },
    })
    rejectedAppId = rejectedApp.id
    await payload.update({
      collection: 'teacher-enquiries',
      id: rejectedAppId,
      data: {
        applicationStatus: 'rejected',
        changeReason: 'Insufficient subject teaching experience',
      },
    })

    const inqRejected = await payload.find({
      collection: 'teacher-enquiries',
      where: { applicationStatus: { not_equals: 'approved' }, id: { equals: rejectedAppId } },
    })
    if (inqRejected.docs.length !== 1) throw new Error('Rejected application missing from active inquiries')

    const tchRejected = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: rejectedAppId } },
    })
    if (tchRejected.docs.length !== 0) throw new Error('Rejected application should NOT be in teachers')
    console.log('✓ Scenario 7: Rejected and other non-approved applications remain in Teacher Inquiries.')

    // 8. Search, filters, pagination
    const searchResult = await payload.find({
      collection: 'teacher-enquiries',
      where: {
        and: [
          { applicationStatus: { not_equals: 'approved' } },
          { fullName: { contains: 'Candidate One' } },
        ],
      },
    })
    if (searchResult.docs.length !== 1) throw new Error('Search failed for Candidate One')
    console.log('✓ Scenario 8: Search and filters work correctly.')

    // 9. Existing audit history remains intact
    const audits = await payload.find({
      collection: 'enquiry-audit-log',
      where: {
        teacherEnquiry: { equals: approvedAppId },
      },
    })
    if (audits.docs.length === 0) throw new Error('Audit log missing for approved application')
    console.log('✓ Scenario 9: Audit history remains intact (' + audits.docs.length + ' transition records found).')

    // 10. Existing teacher profile detail
    const profileDoc = await payload.findByID({
      collection: 'teacher-profiles',
      id: profileId,
    })
    if (!profileDoc || profileDoc.id !== profileId) throw new Error('Could not fetch teacher profile detail')
    console.log('✓ Scenario 10: Teacher profile detail page endpoint retrieves record successfully.')

    console.log('\n--- ALL 10 VERIFICATION SCENARIOS PASSED SUCCESSFULLY! ---')
  } finally {
    // Cleanup test records
    try {
      if (profileId) await payload.delete({ collection: 'teacher-profiles', id: profileId })
      if (newAppId) await payload.delete({ collection: 'teacher-enquiries', id: newAppId })
      if (reviewAppId) await payload.delete({ collection: 'teacher-enquiries', id: reviewAppId })
      if (approvedAppId) await payload.delete({ collection: 'teacher-enquiries', id: approvedAppId })
      if (rejectedAppId) await payload.delete({ collection: 'teacher-enquiries', id: rejectedAppId })
      console.log('Cleaned up test data.')
    } catch {
      // Ignore cleanup error
    }
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification failed:', err)
    process.exit(1)
  })
