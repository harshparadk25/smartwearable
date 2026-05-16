const ds = require('../storage/dataStore');

// POST /api/family/create
exports.createFamily = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { name } = req.body || {};

    const existing = await ds.getFamilyGroupByUserId(userId);
    if (existing) {
      return res.status(409).json({ message: 'Already in a family group. Leave it first.' });
    }

    const group = await ds.createFamilyGroup({
      name: (name || '').trim() || 'My Family',
      adminUserId: userId
    });

    return res.status(201).json(group);
  } catch (err) {
    return next(err);
  }
};

// POST /api/family/join
exports.joinFamily = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { inviteCode } = req.body || {};

    if (!inviteCode) {
      return res.status(400).json({ message: 'inviteCode is required' });
    }

    const existing = await ds.getFamilyGroupByUserId(userId);
    if (existing) {
      return res.status(409).json({ message: 'Already in a family group. Leave it first.' });
    }

    const group = await ds.getFamilyGroupByInviteCode(inviteCode.trim().toUpperCase());
    if (!group) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (group.members.some((m) => m.userId === userId)) {
      return res.status(409).json({ message: 'Already a member of this group' });
    }

    await ds.addFamilyMember(group._id, userId, 'member');
    return res.json({ message: 'Joined family group', groupId: group._id });
  } catch (err) {
    return next(err);
  }
};

// POST /api/family/link-member  — admin links another user by their device PIN
exports.linkMemberByPin = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { pin } = req.body || {};

    if (!pin) {
      return res.status(400).json({ message: 'pin is required' });
    }

    const group = await ds.getFamilyGroupByUserId(adminId);
    if (!group) {
      return res.status(404).json({ message: 'Create a family group first' });
    }
    if (group.adminUserId !== adminId) {
      return res.status(403).json({ message: 'Only the admin can link members by PIN' });
    }

    const device = await ds.findDeviceByPin(String(pin).trim());
    if (!device) {
      return res.status(404).json({ message: 'No device found with that PIN' });
    }

    const targetUserId = device.userId;
    if (group.members.some((m) => m.userId === targetUserId)) {
      return res.status(409).json({ message: 'That user is already in this group' });
    }

    await ds.addFamilyMember(group._id, targetUserId, 'member');

    const user = await ds.getUserById(targetUserId);
    return res.json({
      message: 'Member linked',
      member: { userId: targetUserId, name: user?.name || 'Unknown', devicePin: pin }
    });
  } catch (err) {
    return next(err);
  }
};

// GET /api/family
exports.getFamily = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const group = await ds.getFamilyGroupByUserId(userId);
    if (!group) return res.json(null);

    const memberIds = group.members.map((m) => m.userId);
    const [users, devices] = await Promise.all([
      ds.getUsersByIds(memberIds),
      ds.getDevicesByUserIds(memberIds)
    ]);

    const membersWithData = await Promise.all(
      group.members.map(async (m) => {
        const user = users.find((u) => u._id === m.userId);
        const latestVitals = await ds.getLatestHealthDataByUserId(m.userId);
        const memberDevices = devices
          .filter((d) => d.userId === m.userId)
          .map(({ _id, pin, name, lastSeen, status }) => ({ _id, pin, name, lastSeen, status }));

        return {
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          name: user?.name || 'Unknown',
          email: user?.email || '',
          latestVitals: latestVitals || null,
          devices: memberDevices
        };
      })
    );

    return res.json({
      _id: group._id,
      name: group.name,
      inviteCode: group.inviteCode,
      adminUserId: group.adminUserId,
      createdAt: group.createdAt,
      isAdmin: group.adminUserId === userId,
      members: membersWithData
    });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/family/leave
exports.leaveFamily = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const group = await ds.getFamilyGroupByUserId(userId);
    if (!group) {
      return res.status(404).json({ message: 'Not in a family group' });
    }

    if (group.adminUserId === userId) {
      await ds.deleteFamilyGroup(group._id);
      return res.json({ message: 'Family group disbanded' });
    }

    await ds.removeFamilyMember(group._id, userId);
    return res.json({ message: 'Left family group' });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/family/members/:userId  — admin removes a member
exports.removeMember = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const targetId = req.params.userId;

    const group = await ds.getFamilyGroupByUserId(adminId);
    if (!group) return res.status(404).json({ message: 'Not in a family group' });
    if (group.adminUserId !== adminId) {
      return res.status(403).json({ message: 'Only the admin can remove members' });
    }
    if (targetId === adminId) {
      return res.status(400).json({ message: 'Admin cannot remove themselves. Disband the group instead.' });
    }

    await ds.removeFamilyMember(group._id, targetId);
    return res.json({ message: 'Member removed' });
  } catch (err) {
    return next(err);
  }
};
