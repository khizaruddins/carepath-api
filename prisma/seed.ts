import { PrismaClient, Role, UserStatus, Gender, BloodGroup, DoctorVerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding CarePath development database...');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  // 1. Seed Patient User
  const patient = await prisma.user.upsert({
    where: { email: 'patient@carepath.example.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
    },
    create: {
      email: 'patient@carepath.example.com',
      passwordHash,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      phoneNumber: '+1-555-0199',
      patientProfile: {
        create: {
          fullName: 'Alex Morgan',
          dateOfBirth: new Date('1990-05-14'),
          gender: Gender.FEMALE,
          mobile: '+1-555-0199',
          email: 'patient@carepath.example.com',
          city: 'Seattle',
          bloodGroup: BloodGroup.O_POSITIVE,
          emergencyContactName: 'Taylor Morgan',
          emergencyContactPhone: '+1-555-0188',
          emergencyContactRelation: 'Spouse',
          knownConditions: ['Asthma', 'Mild Hypertension'],
          allergies: ['Penicillin', 'Sulfa drugs'],
          currentMedications: ['Albuterol inhaler PRN', 'Lisinopril 5mg daily'],
          pastSurgeries: ['Laparoscopic Appendectomy (2019)'],
          importantMedicalHistory:
            'No known drug-drug interactions. Annual pulmonary follow-up maintained.',
        },
      },
    },
  });

  // 2. Seed Doctor User
  await prisma.user.upsert({
    where: { email: 'doctor@carepath.example.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
    },
    create: {
      email: 'doctor@carepath.example.com',
      passwordHash,
      role: Role.DOCTOR,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      phoneNumber: '+1-555-0144',
      doctorProfile: {
        create: {
          fullName: 'Dr. Sarah Jenkins, MD',
          specialization: 'Internal Medicine & Cardiology',
          licenseNumber: 'MD-US-984321',
          hospitalAffiliation: 'Metropolis General Hospital',
          bio: 'Board-certified cardiologist and internist specializing in preventative cardiovascular medicine, lipidology, and chronic disease management. Passionate about empowering patients with transparent health records.',
          yearsOfExperience: 14,
          medicalCertificate: 'ABIM Board Certified in Cardiovascular Disease (#394821)',
          education: 'MD - Johns Hopkins University School of Medicine',
          consultationFee: '$120 / Review',
          verificationStatus: DoctorVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
        },
      },
    },
  });

  // Doctor profile update in case user already existed
  const doctorUser = await prisma.user.findUnique({ where: { email: 'doctor@carepath.example.com' } });
  if (doctorUser) {
    await prisma.doctorProfile.upsert({
      where: { userId: doctorUser.id },
      update: {
        bio: 'Board-certified cardiologist and internist specializing in preventative cardiovascular medicine, lipidology, and chronic disease management. Passionate about empowering patients with transparent health records.',
        yearsOfExperience: 14,
        medicalCertificate: 'ABIM Board Certified in Cardiovascular Disease (#394821)',
        education: 'MD - Johns Hopkins University School of Medicine',
        consultationFee: '$120 / Review',
        verificationStatus: DoctorVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      },
      create: {
        userId: doctorUser.id,
        fullName: 'Dr. Sarah Jenkins, MD',
        specialization: 'Internal Medicine & Cardiology',
        licenseNumber: 'MD-US-984321',
        hospitalAffiliation: 'Metropolis General Hospital',
        bio: 'Board-certified cardiologist and internist specializing in preventative cardiovascular medicine, lipidology, and chronic disease management.',
        yearsOfExperience: 14,
        medicalCertificate: 'ABIM Board Certified in Cardiovascular Disease (#394821)',
        education: 'MD - Johns Hopkins University School of Medicine',
        consultationFee: '$120 / Review',
        verificationStatus: DoctorVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });

    // Seed approved consent between patient and doctor
    await prisma.doctorPatientAccess.upsert({
      where: {
        patientId_doctorId: {
          patientId: patient.id,
          doctorId: doctorUser.id,
        },
      },
      update: {
        status: 'APPROVED',
      },
      create: {
        patientId: patient.id,
        doctorId: doctorUser.id,
        status: 'APPROVED',
        notes: 'Initial primary care records request for annual cardiovascular health audit.',
      },
    });

    // Seed sample patient review for doctor
    const existingReview = await prisma.doctorReview.findFirst({
      where: { doctorId: doctorUser.id, patientId: patient.id },
    });
    if (!existingReview) {
      await prisma.doctorReview.create({
        data: {
          doctorId: doctorUser.id,
          patientId: patient.id,
          rating: 5,
          comment: 'Dr. Jenkins thoroughly reviewed my complete metabolic panel and explained every biomarker with great patience. Highly recommend!',
        },
      });
    }
  }

  // 3. Seed Admin User
  await prisma.user.upsert({
    where: { email: 'admin@carepath.example.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
    },
    create: {
      email: 'admin@carepath.example.com',
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      adminProfile: {
        create: {
          fullName: 'System Administrator',
          department: 'Security & Compliance',
        },
      },
    },
  });

  // 4. Seed Suspended User (for testing status guards)
  await prisma.user.upsert({
    where: { email: 'suspended@carepath.example.com' },
    update: {
      passwordHash,
      status: UserStatus.SUSPENDED,
      isEmailVerified: true,
    },
    create: {
      email: 'suspended@carepath.example.com',
      passwordHash,
      role: Role.PATIENT,
      status: UserStatus.SUSPENDED,
      isEmailVerified: true,
      patientProfile: {
        create: {
          fullName: 'Suspended Test User',
          city: 'Chicago',
        },
      },
    },
  });

  // 5. Seed Lab User
  await prisma.user.upsert({
    where: { email: 'lab@carepath.example.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
    },
    create: {
      email: 'lab@carepath.example.com',
      passwordHash,
      role: Role.LAB,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
    },
  });

  console.log('Seeding completed successfully!');
  console.log('Credentials:');
  console.log('  Patient: patient@carepath.example.com / Password123!');
  console.log('  Doctor:  doctor@carepath.example.com  / Password123!');
  console.log('  Admin:   admin@carepath.example.com   / Password123!');
  console.log('  Lab:     lab@carepath.example.com     / Password123!');
  console.log('  Suspended: suspended@carepath.example.com / Password123!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
