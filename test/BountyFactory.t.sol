// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RewardToken} from "../src/RewardToken.sol";
import {BountyFactory} from "../src/BountyFactory.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

contract BountyFactoryTest is Test {
    RewardToken token;
    BountyFactory factory;

    address owner = makeAddr("owner");
    address funder = makeAddr("funder");
    address worker = makeAddr("worker");
    address oracle = makeAddr("oracle");
    address rando = makeAddr("rando");

    uint256 constant REWARD = 100 ether;
    string constant META = "ipfs://meta";
    uint256 deadline;

    function setUp() public {
        token = new RewardToken(1000 ether, funder);
        factory = new BountyFactory(owner);
        deadline = block.timestamp + 7 days;
    }

    function _buat() internal returns (BountyEscrow escrow) {
        vm.prank(funder);
        escrow = factory.createBounty(IERC20(address(token)), REWARD, META, deadline);
    }

    // ---------- constructor ----------
    function test_ConstructorSetsOwner() public view {
        assertEq(factory.owner(), owner);
        assertEq(factory.oracle(), address(0));
        assertEq(factory.jumlahBounty(), 0);
    }

    // ---------- setOracle ----------
    function test_SetOracle() public {
        vm.prank(owner);
        factory.setOracle(oracle);
        assertEq(factory.oracle(), oracle);
    }

    function test_SetOracleOnlyOwner() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        factory.setOracle(oracle);
    }

    function test_SetOracleRevertZero() public {
        vm.prank(owner);
        vm.expectRevert(BountyFactory.OracleNol.selector);
        factory.setOracle(address(0));
    }

    function test_SetOracleChange() public {
        vm.startPrank(owner);
        factory.setOracle(oracle);
        factory.setOracle(rando);
        vm.stopPrank();
        assertEq(factory.oracle(), rando);
    }

    // ---------- createBounty ----------
    function test_CreateBountyFunderIsCaller() public {
        BountyEscrow escrow = _buat();
        assertEq(escrow.funder(), funder);
        assertEq(address(escrow.factory()), address(factory));
    }

    function test_CreateBountyPushesRegistry() public {
        BountyEscrow escrow = _buat();
        assertEq(factory.jumlahBounty(), 1);
        assertEq(address(factory.bounties(0)), address(escrow));
        assertEq(address(factory.semuaBounty()[0]), address(escrow));
    }

    function test_CreateBountyEscrowParams() public {
        BountyEscrow escrow = _buat();
        assertEq(escrow.reward(), REWARD);
        assertEq(escrow.deadline(), deadline);
        assertEq(escrow.metadataURI(), META);
        assertEq(address(escrow.rewardToken()), address(token));
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibuka));
    }

    function test_CreateMultipleBounties() public {
        BountyEscrow a = _buat();
        vm.prank(rando);
        BountyEscrow b = factory.createBounty(IERC20(address(token)), REWARD, META, deadline);
        assertEq(factory.jumlahBounty(), 2);
        assertTrue(address(a) != address(b));
        assertEq(b.funder(), rando);
    }

    function test_CreateBountyRevertBadReward() public {
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.RewardNol.selector);
        factory.createBounty(IERC20(address(token)), 0, META, deadline);
    }

    function test_CreateBountyRevertBadDeadline() public {
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.DeadlineTakValid.selector);
        factory.createBounty(IERC20(address(token)), REWARD, META, block.timestamp);
    }

    // ---------- integrasi: escrow baca oracle dari factory ----------
    function test_EscrowReadsOracleFromFactory() public {
        vm.prank(owner);
        factory.setOracle(oracle);
        BountyEscrow escrow = _buat();

        vm.startPrank(funder);
        token.approve(address(escrow), REWARD);
        escrow.fund();
        vm.stopPrank();

        vm.prank(worker);
        escrow.submitWork("ipfs://karya");

        // hanya oracle terdaftar di factory yang bisa fulfill
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanOracle.selector, rando));
        escrow.fulfillVerification(true);

        vm.prank(oracle);
        escrow.fulfillVerification(true);
        assertEq(token.balanceOf(worker), REWARD);
    }
}
